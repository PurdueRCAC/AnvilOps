import type { Octokit } from "octokit";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const listDeployments: HandlerMap["listDeployments"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const page = ctx.request.query.page ?? 0;
  const pageLength = ctx.request.query.length ?? 25;

  if (
    page < 0 ||
    pageLength <= 0 ||
    !Number.isInteger(page) ||
    !Number.isInteger(pageLength)
  ) {
    return json(400, res, {
      code: 400,
      message: "Invalid page or page length.",
    });
  }

  const deployments = await db.deployment.findMany({
    where: {
      app: {
        id: ctx.request.params.appId,
        org: { users: { some: { userId: req.user.id } } },
      },
    },
    include: { config: true },
    orderBy: { createdAt: "desc" },
    skip: page * pageLength,
    take: pageLength,
  });

  const { githubInstallationId } = await db.organization.findFirst({
    where: {
      apps: { some: { id: ctx.request.params.appId } },
      users: { some: { userId: req.user.id } },
    },
    select: { githubInstallationId: true },
  });

  const distinctRepoIDs = [
    ...new Set(deployments.map((it) => it.config.repositoryId).filter(Boolean)),
  ];
  let octokit: Octokit;
  if (distinctRepoIDs.length > 0 && githubInstallationId) {
    octokit = await getOctokit(githubInstallationId);
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

  return json(
    200,
    res,
    await Promise.all(
      deployments.map(async (deployment, index) => {
        return {
          id: deployment.id,
          appId: deployment.appId,
          repositoryURL:
            repos[distinctRepoIDs.indexOf(deployment.config.repositoryId)]
              ?.html_url,
          commitHash: deployment.config.commitHash,
          commitMessage: deployment.commitMessage,
          status: deployment.status,
          createdAt: deployment.createdAt.toISOString(),
          updatedAt: deployment.updatedAt.toISOString(),
          source: deployment.config.source,
          imageTag: deployment.config.imageTag,
        };
      }),
    ),
  );
};
