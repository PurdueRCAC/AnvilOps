import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const removeUserFromOrg: HandlerMap["removeUserFromOrg"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const membership = await db.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: req.user.id,
        organizationId: ctx.request.params.orgId,
      },
      permissionLevel: "OWNER",
    },
  });

  if (!membership) {
    return json(403, res, {});
  }

  try {
    await db.organizationMembership.delete({
      where: {
        userId_organizationId: {
          userId: ctx.request.params.userId,
          organizationId: ctx.request.params.orgId,
        },
      },
    });
  } catch (e: any) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
      return json(404, res, { code: 404, message: "Not found." });
    }

    throw e;
  }

  return json(204, res, {});
};
