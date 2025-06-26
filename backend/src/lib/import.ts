import crypto from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type { Octokit } from "octokit";
import { generateCloneURLWithCredentials } from "../handlers/githubWebhook.ts";
import { k8s } from "./kubernetes.ts";

import { getOctokit, getUserOctokit } from "./octokit.ts";

export async function getLocalRepo(octokit: Octokit, url: URL) {
  if (url.host === new URL(process.env.GITHUB_BASE_URL).host) {
    // The source and target repositories are on the same GitHub instance. We could fork or create from a template.
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
  userId: number,
  installationId: number,
  inputURL: URL,
  targetIsOrganization: boolean,
  newOwner: string,
  newRepoName: string,
  makePrivate: boolean,
  includeAllBranches: boolean,
  code?: string,
): Promise<number | null | "code needed"> {
  const octokit = await getOctokit(installationId);
  try {
    const result = await getLocalRepo(octokit, inputURL);

    if (result) {
      // Try some shortcuts to make the process a bit faster. If they don't work (e.g. we don't have permission), we'll create a Job to clone the repo and push it to its new location.
      const {
        repo: sourceRepo,
        owner: sourceOwner,
        repoName: sourceRepoName,
      } = result;

      if (sourceRepo.data.is_template) {
        // This repo is a template! GitHub offers an API endpoint to create a new repository from this template.
        await octokit.rest.repos.createUsingTemplate({
          template_owner: sourceOwner,
          template_repo: sourceRepoName,
          owner: newOwner,
          name: newRepoName,
          private: makePrivate,
          include_all_branches: includeAllBranches,
        });
      } else {
        // This repo is not a template. We can create a fork of it on the user's account.
        await octokit.rest.repos.createFork({
          owner: sourceOwner,
          repo: sourceRepoName,
          name: newRepoName,
          organization: targetIsOrganization ? newOwner : undefined,
          default_branch_only: !includeAllBranches,
        });
      }

      // Wait for the repository to be created
      return await awaitRepoCreation(octokit, newOwner, newRepoName);
    }
  } catch (e) {
    console.error(
      "Failed to import repository by forking or copying template: ",
      e,
    );
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

  // The source and target repositories are on different GitHub instances, so we'll have to clone and push.

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
  const cloneURL = inputURL.toString(); // No credentials for this one; repos on different Git servers should only be importable if they're public
  const pushURL = await generateCloneURLWithCredentials(octokit, targetURL);

  const job = await k8s.batch.createNamespacedJob({
    namespace: "anvilops-dev",
    body: {
      metadata: {
        name: `import-repo-${crypto.randomBytes(16).toString("hex")}`,
        labels: {
          "anvilops.rcac.purdue.edu/user-id": userId.toString(),
        },
      },
      spec: {
        ttlSecondsAfterFinished: 30, // Delete job 30 seconds after it completes
        backoffLimit: 1, // Retry up to 1 time if they exit with a non-zero status code
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
                ],
                imagePullPolicy: "Always",
                command: ["/bin/sh", "-c"],
                workingDir: "/work",
                args: [
                  `
git clone${includeAllBranches ? " --mirror" : ""} $CLONE_URL .
git push --mirror $PUSH_URL`,
                ],
                volumeMounts: [
                  {
                    mountPath: "/work",
                    name: "work-dir",
                  },
                ],
              },
            ],
            volumes: [
              {
                name: "work-dir",
                emptyDir: {},
              },
            ],
            restartPolicy: "Never",
          },
        },
      },
    },
  });

  await awaitJobCompletion(job.metadata.name);
  return repoID;
}

export async function awaitRepoCreation(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<number | null> {
  // Check whether the repo has been created every 2 seconds for a minute. If so, return early, and if not, keep waiting.
  for (let i = 0; i < 30; i++) {
    try {
      const result = await octokit.rest.repos.get({ owner, repo });
      if (result.data.id) return result.data.id;
    } catch {}
    await setTimeout(2000);
  }
  return null;
}

async function awaitJobCompletion(jobName: string) {
  for (let i = 0; i < 60; i++) {
    const result = await k8s.batch.readNamespacedJobStatus({
      namespace: "anvilops-dev",
      name: jobName,
    });
    if (result.status.succeeded > 0) {
      return true;
    }
    if (result.status.failed > 0) {
      throw new Error("Job failed");
    }
    await setTimeout(1000);
  }
  return false;
}
