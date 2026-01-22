import { createAppAuth, createOAuthUserAuth } from "@octokit/auth-app";
import type { operations } from "@octokit/openapi-types";
import { Octokit, RequestError } from "octokit";
import { db } from "../../db/index.ts";
import { logger } from "../../index.ts";
import {
  InstallationNotFoundError,
  RepositoryNotFoundError,
  ValidationError,
} from "../../service/common/errors.ts";
import { get, getOrCreate, set } from "../cache.ts";
import { env } from "../env.ts";
import { copyRepoManually } from "../import.ts";
import {
  ImportRepoAuthenticationRequiredError,
  type CommitStatus,
  type GitCIWorkflow,
  type GitProvider,
  type GitRepository,
} from "./gitProvider.ts";

const privateKey = Buffer.from(env.GITHUB_PRIVATE_KEY, "base64").toString(
  "utf-8",
);

const installationIdSymbol = Symbol("installationId");

const githubAuthCache = {
  get: (key: string) => get(`github-auth-${key}`),
  set: (key: string, value: any) =>
    set(`github-auth-${key}`, value, 45 * 60, false), // Cache authorization tokens for 45 minutes (they expire after 60 minutes)
};

async function getOctokit(installationId: number) {
  const octokit = new Octokit({
    baseUrl: env.GITHUB_API_URL,
    authStrategy: createAppAuth,
    auth: {
      privateKey,
      appId: env.GITHUB_APP_ID,
      cache: githubAuthCache,
      installationId,
    },
  });

  octokit[installationIdSymbol] = installationId;
  try {
    // Run the authorization step right now so that we can rethrow if the installation wasn't found
    await octokit.auth({ type: "installation" });
  } catch (e) {
    if ((e as RequestError)?.status === 404) {
      // Installation not found. Remove it from its organization(s).
      await db.org.unlinkInstallationFromAllOrgs(installationId);
      throw new InstallationNotFoundError(e);
    }
    throw e;
  }
  return octokit;
}

export class GitHubGitProvider implements GitProvider {
  private octokit: Octokit;
  private installationId: number;

  private constructor(octokit: Octokit, installationId: number) {
    if (!octokit || !installationId || installationId < 0) {
      throw new ValidationError();
    }
    this.octokit = octokit;
    this.installationId = installationId;
  }

  static async getInstance(orgId: number) {
    const org = await db.org.getById(orgId);
    if (!org.githubInstallationId) {
      throw new InstallationNotFoundError(null);
    }

    const octokit = await getOctokit(org.githubInstallationId);

    return new GitHubGitProvider(octokit, org.githubInstallationId);
  }

  async getRepoById(repoId: number): Promise<GitRepository> {
    const repo = await this.getGitHubRepoById(repoId);
    return {
      id: repo.id,
      owner: repo.owner.login,
      name: repo.name,
      htmlURL: repo.html_url,
    };
  }

  async generateCloneURL(repoId: number) {
    const [repo, token] = await Promise.all([
      this.getGitHubRepoById(repoId),
      this.getInstallationAccessToken(),
    ]);
    const url = new URL(repo.clone_url);
    url.username = "x-access-token";
    url.password = token;
    return url.toString();
  }

  async getRepoByName(owner: string, name: string): Promise<GitRepository> {
    const repo = await this.octokit.rest.repos.get({
      owner: owner,
      repo: name,
    });
    return {
      id: repo.data.id,
      owner: repo.data.owner.login,
      name: repo.data.name,
      htmlURL: repo.data.html_url,
    };
  }

  async importRepo(
    userId: number,
    orgId: number,
    sourceURL: URL,
    newOwner: string,
    newRepoName: string,
    makePrivate: boolean,
  ): Promise<number> {
    try {
      // Try to import the repo by using it as a template
      const ret = await this.attemptFastImport(
        sourceURL,
        newOwner,
        newRepoName,
        makePrivate,
      );
      logger.info(
        {
          userId,
          orgId,
          source: sourceURL.toString(),
          destOwner: newOwner,
          destRepo: newRepoName,
          makePrivate: makePrivate,
        },
        "Imported Git repository from template",
      );
      return ret;
    } catch (e) {
      if (e instanceof FastImportUnsupportedError) {
        // Fast import won't work with this repo; we need to clone it manually

        // If the target is an organization, we already have permission to do this.
        const targetIsOrganization = await this.userIsOrg(newOwner);
        if (targetIsOrganization) {
          const repo = await this.octokit.rest.repos.createInOrg({
            org: newOwner,
            name: newRepoName,
            private: makePrivate,
          });

          await this.importRepoManually(sourceURL, repo.data.id);
          return repo.data.id;
        } else {
          // If not, we need to get authorization from the user first.

          const stateId = await db.repoImportState.create(
            userId,
            orgId,
            newOwner,
            newRepoName,
            makePrivate,
            sourceURL.toString(),
          );

          const redirectURL = new URL(env.BASE_URL);
          redirectURL.pathname = "/import-repo"; // this URL is on the frontend; see frontend/src/pages/ImportRepoView.tsx

          throw new ImportRepoAuthenticationRequiredError(
            `${env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${stateId}&redirect_uri=${encodeURIComponent(redirectURL.toString())}`,
          );
        }
      } else {
        throw e;
      }
    }
  }

  async continueImportRepo(
    stateId: string,
    code: string,
    userId: number,
  ): Promise<{ repoId: number; orgId: number; repoName: string }> {
    const state = await db.repoImportState.get(stateId, userId);

    logger.info(
      {
        userId,
        stateId,
        source: state.srcRepoURL.toString(),
        destOwner: state.destRepoOwner,
        destRepo: state.destRepoName,
        makePrivate: state.makePrivate,
      },
      "Importing Git repository with manual clone/copy",
    );

    if (!state) {
      throw new ValidationError("State not found");
    }

    const repo = await GitHubGitProvider.getUserOctokit(
      code,
    ).rest.repos.createForAuthenticatedUser({
      name: state.destRepoName,
      private: state.makePrivate,
    });

    await this.importRepoManually(new URL(state.srcRepoURL), repo.data.id);
    await db.repoImportState.delete(stateId);

    return {
      repoId: repo.data.id,
      orgId: state.orgId,
      repoName: state.destRepoName,
    };
  }

  async getBotCommitterDetails(): Promise<{ name: string; email: string }> {
    const bot = await this.octokit.rest.users.getByUsername({
      username: `${env.GITHUB_APP_NAME}[bot]`, // e.g. "anvilops[bot]"
    });
    return {
      name: bot.data.login,
      email: bot.data.email,
    };
  }

  private static mapStatusAndConclusion(statusIn: CommitStatus) {
    let status: operations["checks/update"]["requestBody"]["content"]["application/json"]["status"],
      conclusion: operations["checks/update"]["requestBody"]["content"]["application/json"]["conclusion"];

    if (
      statusIn === "success" ||
      statusIn === "failure" ||
      statusIn == "cancelled"
    ) {
      status = "completed";
      conclusion = statusIn;
    } else {
      status = statusIn;
    }

    return { status, conclusion };
  }

  async createCheckStatus(
    repoId: number,
    sha: string,
    statusIn: CommitStatus,
    detailsURL: string,
  ): Promise<number> {
    const repo = await this.getGitHubRepoById(repoId);

    const { status, conclusion } =
      GitHubGitProvider.mapStatusAndConclusion(statusIn);

    const check = await this.octokit.rest.checks.create({
      name: "AnvilOps",
      status,
      conclusion,
      owner: repo.owner.login,
      repo: repo.name,
      head_sha: sha,
      details_url: detailsURL,
    });

    return check.data.id;
  }

  async updateCheckStatus(
    repoId: number,
    checkId: number,
    statusIn: CommitStatus,
  ) {
    const repo = await this.getGitHubRepoById(repoId);

    const { status, conclusion } =
      GitHubGitProvider.mapStatusAndConclusion(statusIn);

    await this.octokit.rest.checks.update({
      check_run_id: checkId,
      status,
      conclusion,
      owner: repo.owner.login,
      repo: repo.name,
    });
  }

  async getCommitMessage(repoId: number, sha: string): Promise<string> {
    const repo = await this.getRepoById(repoId);
    const response = await this.octokit.rest.repos.getCommit({
      owner: repo.owner,
      repo: repo.name,
      ref: sha,
    });
    return response.data.commit.message;
  }

  async getLatestCommit(
    repoId: number,
    branch: string,
  ): Promise<{ sha: string; message: string }> {
    const repo = await this.getRepoById(repoId);
    const commits = await this.octokit.rest.repos.listCommits({
      owner: repo.owner,
      repo: repo.name,
      ref: branch,
      per_page: 1,
    });
    return {
      sha: commits.data[0].sha,
      message: commits.data[0].commit.message,
    };
  }

  async getWorkflows(repoId: number): Promise<GitCIWorkflow[]> {
    const workflows = (await this.octokit
      .request({
        method: "GET",
        url: `/repositories/${repoId}/actions/workflows`,
      })
      .then((res) => res.data.workflows)) as Awaited<
      ReturnType<typeof this.octokit.rest.actions.getWorkflow>
    >["data"][];

    return workflows.map((w) => ({ id: w.id, name: w.name, path: w.path }));
  }

  async getBranches(
    repoId: number,
  ): Promise<{ defaultBranch: string; names: string[] }> {
    const repo = await this.getGitHubRepoById(repoId);
    const branches = await this.octokit.rest.repos.listBranches({
      owner: repo.owner.login,
      repo: repo.name,
    });

    return {
      defaultBranch: repo.default_branch,
      names: branches.data.map((b) => b.name),
    };
  }

  // TODO Add support for pagination or fetch all repos at once
  async getAllRepos(): Promise<GitRepository[]> {
    const repos =
      await this.octokit.rest.apps.listReposAccessibleToInstallation();

    return repos.data.repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      owner: repo.owner.login,
      htmlURL: repo.html_url,
    }));
  }

  async getInstallationInfo() {
    const installation = await this.octokit.rest.apps.getInstallation({
      installation_id: this.installationId,
    });

    return {
      hasAllRepoAccess: installation.data.repository_selection === "all",
      targetId: installation.data.target_id,
      targetType: installation.data.target_type as "User" | "Organization",
      targetName:
        // `slug` is present when `account` is an Organization, and `login` is present when it's a User
        "slug" in installation.data.account
          ? installation.data.account.slug
          : installation.data.account.login,
    };
  }

  private async userIsOrg(username: string): Promise<boolean> {
    // On GitHub, you can't create a user with the same name as an organization, so
    // if the user exists, the target is a regular user. If not, the target is an organization.
    try {
      await this.octokit.rest.users.getByUsername({
        username: username,
      });
      return false;
    } catch (e) {
      if (e instanceof RequestError && e.status === 404) {
        // User not found
        return true;
      }
      throw e;
    }
  }

  private async importRepoManually(sourceURL: URL, destRepoId: number) {
    let cloneURL: string;
    if (sourceURL.host === new URL(env.GITHUB_API_URL).host) {
      // The source is on the same GitHub instance, so use our credentials to clone the repo just in case it's private
      const { owner, repoName } = this.getRepoInfoFromURL(sourceURL);
      const repo = await this.getRepoByName(owner, repoName);
      cloneURL = await this.generateCloneURL(repo.id);
    } else {
      cloneURL = sourceURL.toString();
    }

    const pushURL = await this.generateCloneURL(destRepoId);

    await copyRepoManually(this, cloneURL, pushURL);
  }

  private getRepoInfoFromURL(sourceURL: URL): {
    owner: string;
    repoName: string;
  } {
    if (sourceURL.host !== new URL(env.GITHUB_API_URL).host) {
      throw new ValidationError("GitHub server hostname mismatch");
    }

    const pathname = sourceURL.pathname.split("/"); // /owner/repo
    if (pathname.length !== 3) {
      throw new FastImportUnsupportedError(null, {
        cause: new ValidationError("Invalid repo URL"),
      });
    }
    const [, owner, repoName] = pathname;
    return { owner, repoName };
  }

  private async attemptFastImport(
    sourceURL: URL,
    newOwner: string,
    newRepoName: string,
    makePrivate: boolean,
  ): Promise<number> {
    const destServer = new URL(env.GITHUB_API_URL);
    if (sourceURL.host !== destServer.host) {
      // Repositories are on different Git servers - we can't use GitHub's template feature
      throw new FastImportUnsupportedError();
    }

    // The source and target repositories are on the same GitHub instance. We could create from a template.
    const { owner, repoName } = this.getRepoInfoFromURL(sourceURL);

    const sourceRepo = await this.octokit.rest.repos.get({
      owner,
      repo: repoName,
    });

    if (sourceRepo.data.is_template) {
      // This repo is a template! GitHub offers an API endpoint to create a new repository from this template.
      const repo = await this.octokit.rest.repos.createUsingTemplate({
        template_owner: owner,
        template_repo: repoName,
        owner: newOwner,
        name: newRepoName,
        private: makePrivate,
        include_all_branches: false,
      });

      return repo.data.id;
    } else {
      throw new FastImportUnsupportedError();
    }
  }

  private async getInstallationAccessToken() {
    const { token } = (await this.octokit.auth({
      type: "installation",
    })) as any;
    return token as string;
  }

  private async getGitHubRepoById(repoId: number) {
    type Repo = Awaited<ReturnType<typeof this.octokit.rest.repos.get>>["data"];

    return JSON.parse(
      await getOrCreate(
        `github-repo-${this.installationId}-${repoId}`,
        30,
        async () => {
          try {
            const repoResponse = await this.octokit.request({
              // This API is undocumented but will likely stick around(?) - https://github.com/piotrmurach/github/issues/283#issuecomment-249092851
              method: "GET",
              url: `/repositories/${repoId}`,
            });
            const repo = repoResponse.data as Repo;

            return JSON.stringify(repo);
          } catch (e) {
            if (e instanceof RequestError && e.status === 404) {
              // Repository not found
              throw new RepositoryNotFoundError();
            }
            throw e;
          }
        },
      ),
    ) as Repo;
  }

  static async getUserFromOAuthCode(code: string) {
    const user =
      await GitHubGitProvider.getUserOctokit(
        code,
      ).rest.users.getAuthenticated();

    return { id: user.data.id, login: user.data.login };
  }

  static async userCanAccessInstallation(
    code: string,
    installationId: number,
  ): Promise<boolean> {
    const octokit = GitHubGitProvider.getUserOctokit(code);
    const installations = (
      await octokit.rest.apps.listInstallationsForAuthenticatedUser()
    ).data.installations;
    for (const install of installations) {
      if (install.id === installationId) {
        return true;
      }
    }
    return false;
  }

  static getUserOctokit(code: string) {
    return new Octokit({
      authStrategy: createOAuthUserAuth,
      auth: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        code: code,
      } satisfies Parameters<typeof createOAuthUserAuth>[0],
      baseUrl: env.GITHUB_API_URL,
    });
  }
}

class FastImportUnsupportedError extends Error {}
