import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const removeUserFromOrg: HandlerMap["removeUserFromOrg"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await db.organizationMembership.delete({
      where: {
        userId_organizationId: {
          userId: ctx.request.params.userId,
          organizationId: ctx.request.params.orgId,
        },
        organization: {
          users: {
            some: {
              userId: req.user.id,
              permissionLevel: "OWNER",
            },
          },
        },
      },
    });
  } catch (e: any) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
      return json(404, res, { message: "User not found." });
    }
  }

  return json(204, res, {});
};
