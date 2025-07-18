import type { AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";

export const listDeployments: HandlerMap["listDeployments"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const deployments = await db.deployment.findMany({
    where: {
      app: {
        id: ctx.request.params.appId,
        org: { users: { some: { userId: req.user.id } } },
      },
    },
    include: { config: true },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return json(
    200,
    res,
    deployments.map((d) => ({
      id: d.id,
      appId: d.appId,
      commitHash: d.commitHash,
      commitMessage: d.commitMessage,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      source: d.config.source,
      imageTag: d.config.imageTag,
    })),
  );
};
