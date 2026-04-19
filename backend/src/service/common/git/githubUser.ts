import { createOAuthUserAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";

/**
 * Handles GitHub operations that aren't scoped to an organization's GitHub App installation.
 * Organization-specific operations should go in GitHubGitProvider.
 */
export class GitHubUserService {
  private githubApiURL: string;
  private githubClientId: string;
  private githubClientSecret: string;

  constructor(
    githubApiURL: string,
    githubClientId: string,
    githubClientSecret: string,
  ) {
    this.githubApiURL = githubApiURL;
    this.githubClientId = githubClientId;
    this.githubClientSecret = githubClientSecret;
  }

  async getUserFromOAuthCode(code: string) {
    const user = await this.getUserOctokit(code).rest.users.getAuthenticated();

    return { id: user.data.id, login: user.data.login };
  }

  async userCanAccessInstallation(
    code: string,
    installationId: number,
  ): Promise<boolean> {
    const octokit = this.getUserOctokit(code);
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

  getUserOctokit(code: string) {
    return new Octokit({
      authStrategy: createOAuthUserAuth,
      auth: {
        clientId: this.githubClientId,
        clientSecret: this.githubClientSecret,
        code: code,
      } satisfies Parameters<typeof createOAuthUserAuth>[0],
      baseUrl: this.githubApiURL,
    });
  }
}
