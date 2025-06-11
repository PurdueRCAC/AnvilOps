import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";

export const listDeployments: HandlerMap["listDeployments"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const deployments = await db.deployment.findMany({
    where: {
      id: ctx.request.params.appId,
      app: { org: { users: { some: { userId: req.user.id } } } },
    },
    take: 25,
  });

  return json(
    200,
    res,
    deployments.map((d) => ({
      id: d.id,
      commitHash: d.commitHash,
      commitMessage: d.commitMessage,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  );
};
