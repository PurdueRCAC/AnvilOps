import crypto from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type { Octokit } from "octokit";
import { logger } from "../index.ts";
import { svcK8s } from "./cluster/kubernetes.ts";
import { env } from "./env.ts";
import {
  generateCloneURLWithCredentials,
  getOctokit,
  getUserOctokit,
} from "./octokit.ts";

export async function getLocalRepo(octokit: Octokit, url: URL) {
  if (url.host === new URL(env.GITHUB_BASE_URL).host) {
    // The source and target repositories are on the same GitHub instance. We could create from a template.
    const pathname = url.pathname.split("/"); // /owner/repo
    if (pathname.length !== 3) {
      throw new Error("Invalid repo URL");
    }
    const [, owner, repoName] = pathname;

    const repo = await octokit.rest.repos.get({
      owner: owner,
      repo: repoName,
    });

    return { repo, owner, repoName };
  }
  return null;
}

export async function importRepo(
  installationId: number,
  inputURL: URL,
  targetIsOrganization: boolean,
  newOwner: string,
  newRepoName: string,
  makePrivate: boolean,
  code?: string,
): Promise<number | null | "code needed"> {
  const octokit = await getOctokit(installationId);
  try {
    return await copyFromTemplate(
      octokit,
      inputURL,
      newOwner,
      newRepoName,
      makePrivate,
    );
  } catch (e) {
    try {
      const newRepo = await octokit.rest.repos.get({
        owner: newOwner,
        repo: newRepoName,
      });
      if (newRepo.data.id) {
        return newRepo.data.id; // The repo *was* created even though an error was thrown
      }
    } catch {}

    if (!code) {
      // We'll need an authorization code to continue
      return "code needed";
    }
    // (don't return, we want to try another way to import this repository)
  }

  // The source and target repositories are on different GitHub instances or the source isn't a template, so we'll have to clone and push.

  let targetURL: string;
  let repoID: number;
  if (targetIsOrganization) {
    const repo = await octokit.rest.repos.createInOrg({
      org: newOwner,
      name: newRepoName,
      private: makePrivate,
    });
    targetURL = repo.data.html_url;
    repoID = repo.data.id;
  } else {
    const repo = await getUserOctokit(
      code,
    ).rest.repos.createForAuthenticatedUser({
      name: newRepoName,
      private: makePrivate,
    });
    targetURL = repo.data.html_url;
    repoID = repo.data.id;
  }

  // Generate GitHub URLs with access tokens in the password portion
  const cloneURL = await generateCloneURLWithCredentials(
    octokit,
    inputURL.toString(),
  );
  const pushURL = await generateCloneURLWithCredentials(octokit, targetURL);

  await copyRepoManually(octokit, cloneURL, pushURL);
  return repoID;
}

async function copyFromTemplate(
  octokit: Octokit,
  sourceURL: URL,
  newOwner: string,
  newRepoName: string,
  makePrivate: boolean,
) {
  const result = await getLocalRepo(octokit, sourceURL);

  if (!result) {
    throw new Error(
      "Repository not found on local Git server. Copying from template is not possible.",
    );
  }

  const {
    repo: sourceRepo,
    owner: sourceOwner,
    repoName: sourceRepoName,
  } = result;

  if (sourceRepo.data.is_template) {
    // This repo is a template! GitHub offers an API endpoint to create a new repository from this template.
    const repo = await octokit.rest.repos.createUsingTemplate({
      template_owner: sourceOwner,
      template_repo: sourceRepoName,
      owner: newOwner,
      name: newRepoName,
      private: makePrivate,
      include_all_branches: false,
    });

    return repo.data.id;
  } else {
    throw new Error("Source repository is not a template.");
  }
}

async function copyRepoManually(
  octokit: Octokit,
  cloneURL: string,
  pushURL: string,
) {
  const botUser = await octokit.rest.users.getByUsername({
    username: `${env.GITHUB_APP_NAME}[bot]`, // e.g. "anvilops[bot]"
  });

  const job = await svcK8s["BatchV1Api"].createNamespacedJob({
    namespace: env.CURRENT_NAMESPACE,
    body: {
      metadata: {
        name: `import-repo-${crypto.randomBytes(16).toString("hex")}`,
      },
      spec: {
        ttlSecondsAfterFinished: 30, // Delete job 30 seconds after it completes
        backoffLimit: 1, // Retry up to 1 time if the job exits with a non-zero status code
        activeDeadlineSeconds: 2 * 60, // Kill after 2 minutes
        template: {
          spec: {
            containers: [
              {
                name: "importer",
                image: "alpine/git:v2.49.0",
                env: [
                  { name: "CLONE_URL", value: cloneURL },
                  { name: "PUSH_URL", value: pushURL },
                  { name: "USER_EMAIL", value: botUser.data.email },
                  { name: "USER_NAME", value: botUser.data.login },
                ],
                imagePullPolicy: "Always",
                command: ["/bin/sh", "-c"],
                workingDir: "/work",
                args: [
                  `
git clone --depth=1 --shallow-submodules "$CLONE_URL" .
rm -rf .git

git init
git branch -M main

git config user.email "$USER_EMAIL"
git config user.name "$USER_NAME"

git add .
git commit -m "Initial commit"

git remote add origin "$PUSH_URL"
git push -u origin main`,
                ],
                volumeMounts: [
                  {
                    mountPath: "/work",
                    name: "work-dir",
                  },
                ],
                resources: {
                  requests: {
                    cpu: "500m",
                    memory: "512Mi",
                  },
                  limits: {
                    cpu: "500m",
                    memory: "512Mi",
                  },
                },
                securityContext: {
                  // TODO: Use a custom image that specifies a user. Then, add a securityContext that runs as that non-root user and enables readOnlyRootFileSystem.
                  capabilities: {
                    drop: ["ALL"],
                  },
                  allowPrivilegeEscalation: false,
                },
              },
            ],
            volumes: [
              {
                name: "work-dir",
                emptyDir: {
                  sizeLimit: "1Gi",
                },
              },
            ],
            restartPolicy: "Never",
          },
        },
      },
    },
  });

  logger.info(
    { jobNamespace: job.metadata.namespace, jobName: job.metadata.name },
    "Created manual Git repo import job",
  );

  await awaitJobCompletion(job.metadata.name);
}

async function awaitJobCompletion(jobName: string) {
  for (let i = 0; i < 120; i++) {
    const result = await svcK8s["BatchV1Api"].readNamespacedJobStatus({
      namespace: env.CURRENT_NAMESPACE,
      name: jobName,
    });
    if (result.status.succeeded > 0) {
      return true;
    }
    if (result.status.failed > 0) {
      logger.warn(
        {
          jobNamespace: result.metadata.namespace,
          jobName: result.metadata.name,
        },
        "Git repo import job failed",
      );
      throw new Error("Job failed");
    }
    await setTimeout(500);
  }
  return false;
}
