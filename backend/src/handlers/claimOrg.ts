import { type UnassignedInstallation } from "../generated/prisma/client.ts";
import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
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
  try {
    await db.$transaction(async (tx) => {
      let installation: UnassignedInstallation;
      try {
        installation = await tx.unassignedInstallation.delete({
          where: { id: unassignedInstallationId, userId: req.user.id },
        });
      } catch (e) {
        if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
          throw { error: "Installation does not exist" };
        }

        throw e;
      }
      try {
        await tx.organization.update({
          where: {
            id: orgId,
            users: { some: { userId: req.user.id, permissionLevel: "OWNER" } },
          },
          data: {
            githubInstallationId: installation.id,
          },
        });
      } catch (e) {
        if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
          throw { error: "Organization does not exist" };
        }
        throw e;
      }
    });
  } catch (e) {
    if (e.error) {
      return json(404, res, { code: 404, message: e.error });
    }

    throw e;
  }
  return json(200, res, {});
};
