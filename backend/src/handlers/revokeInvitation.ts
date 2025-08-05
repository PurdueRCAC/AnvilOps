import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const revokeInvitation: HandlerMap["revokeInvitation"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await db.invitation.delete({
      where: {
        id: ctx.request.params.invId,
        orgId: ctx.request.params.orgId,
        OR: [
          // To delete an invitation, the current user must be the inviter, the invitee, or a member of the organization that the invitation is for.
          { inviteeId: req.user.id },
          { inviterId: req.user.id },
          {
            org: {
              users: {
                some: { userId: req.user.id },
              },
            },
          },
        ],
      },
    });
  } catch (e: any) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
      return json(404, res, { message: "Invitation not found." });
    }
    throw e;
  }

  return json(204, res, {});
};
