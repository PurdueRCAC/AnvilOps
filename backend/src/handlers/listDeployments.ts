import type { AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";

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
    return json(400, res, {});
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

  const octokit = await getOctokit(githubInstallationId);

  return json(
    200,
    res,
    await Promise.all(
      deployments.map(async (d) => {
        const repositoryURL =
          d.config.source === "GIT"
            ? await getRepoById(octokit, d.config.repositoryId).then(
                (repo) => repo.html_url,
                (err) => {
                  console.error(err);
                  return undefined;
                },
              )
            : undefined;
        return {
          id: d.id,
          appId: d.appId,
          repositoryURL,
          commitHash: d.commitHash,
          commitMessage: d.commitMessage,
          status: d.status,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
          source: d.config.source,
          imageTag: d.config.imageTag,
        };
      }),
    ),
  );
};
