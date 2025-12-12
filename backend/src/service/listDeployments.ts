import type { Octokit } from "octokit";
import { db } from "../db/index.ts";
import type { DeploymentWithSourceInfo } from "../db/models.ts";
import type { components } from "../generated/openapi.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { AppNotFoundError, ValidationError } from "./common/errors.ts";

export async function listDeployments(
  appId: number,
  userId: number,
  page: number,
  pageLength: number,
) {
  if (
    page < 0 ||
    pageLength <= 0 ||
    !Number.isInteger(page) ||
    !Number.isInteger(pageLength)
  ) {
    throw new ValidationError("Invalid page or page length.");
  }

  const app = await db.app.getById(appId, {
    requireUser: { id: userId },
  });

  if (!app) {
    throw new AppNotFoundError();
  }

  const org = await db.org.getById(app.orgId);

  const deployments = await db.deployment.listForApp(app.id, page, pageLength);

  const distinctRepoIDs = [
    ...new Set(deployments.map((it) => it.repositoryId).filter(Boolean)),
  ];
  let octokit: Octokit;
  if (distinctRepoIDs.length > 0 && org.githubInstallationId) {
    octokit = await getOctokit(org.githubInstallationId);
  }
  const repos = await Promise.all(
    distinctRepoIDs.map(async (id) => {
      if (id) {
        try {
          return octokit ? await getRepoById(octokit, id) : null;
        } catch (error) {
          if (error?.status === 404) {
            // The repo couldn't be found. Either it doesn't exist or the installation doesn't have permission to see it.
            return undefined;
          }
          throw error; // Rethrow any other kind of error
        }
      }
      return undefined;
    }),
  );

  const modifiedDeployments = deployments as Array<
    Omit<DeploymentWithSourceInfo, "status"> & {
      status: components["schemas"]["AppSummary"]["status"];
    }
  >;

  let sawSuccess = false;
  for (const deployment of modifiedDeployments) {
    if (deployment.status === "COMPLETE") {
      if (!sawSuccess) {
        sawSuccess = true;
      } else {
        deployment.status = "STOPPED";
      }
    }
  }

  return modifiedDeployments.map((deployment) => {
    return {
      id: deployment.id,
      appId: deployment.appId,
      repositoryURL:
        repos[distinctRepoIDs.indexOf(deployment.repositoryId)]?.html_url,
      commitHash: deployment.commitHash,
      commitMessage: deployment.commitMessage,
      status: deployment.status,
      createdAt: deployment.createdAt.toISOString(),
      updatedAt: deployment.updatedAt.toISOString(),
      source: deployment.source,
      imageTag: deployment.imageTag,
    };
  });
}
