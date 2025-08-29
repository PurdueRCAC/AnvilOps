import { PermissionLevel } from "../generated/prisma/enums.ts";
import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const acceptInvitation: HandlerMap["acceptInvitation"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await db.$transaction(async (tx) => {
      const invitation = await tx.invitation.delete({
        where: {
          id: ctx.request.params.invId,
          orgId: ctx.request.params.orgId,
          inviteeId: req.user.id,
        },
      });

      await tx.organizationMembership.create({
        data: {
          organizationId: invitation.orgId,
          permissionLevel: PermissionLevel.USER,
          userId: invitation.inviteeId,
        },
      });
    });
  } catch (e: any) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
      return json(404, res, { code: 404, message: "Invitation not found." });
    }
    throw e;
  }

  return json(200, res, {});
};
