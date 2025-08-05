import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const claimOrg: HandlerMap["claimOrg"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const unassignedInstallationId =
    ctx.request.requestBody.unclaimedInstallationId;
  const orgId = ctx.request.params.orgId;

  await db.$transaction(async (tx) => {
    const installation = await tx.unassignedInstallation.delete({
      where: { id: unassignedInstallationId, userId: req.user.id },
    });

    await tx.organization.update({
      where: {
        id: orgId,
        users: { some: { userId: req.user.id, permissionLevel: "OWNER" } },
      },
      data: {
        githubInstallationId: installation.id,
      },
    });
  });

  return json(200, res, {});
};
