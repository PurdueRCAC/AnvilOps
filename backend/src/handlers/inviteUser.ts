import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const inviteUser: HandlerMap["inviteUser"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const otherUser = await db.user.findFirst({
    where: { email: ctx.request.requestBody.email.toLowerCase() },
    select: { id: true },
  });

  if (otherUser.id === req.user.id) {
    return json(400, res, {
      message: "You cannot send an invitation to yourself.",
    });
  }

  if (otherUser === null) {
    return json(404, res, {
      code: 404,
      message:
        "No user was found with that email address. Make sure it is spelled correctly.",
    });
  }
  try {
    await db.organization.update({
      where: {
        users: { some: { userId: req.user.id } },
        id: ctx.request.params.orgId,
      },
      data: {
        outgoingInvitations: {
          create: {
            inviteeId: otherUser.id,
            inviterId: req.user.id,
          },
        },
      },
    });
  } catch (e: any) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
      // https://www.prisma.io/docs/orm/reference/error-reference#p2025
      // "An operation failed because it depends on one or more records that were required but not found."
      return json(404, res, { code: 404, message: "Organization not found." });
    }
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      // Unique constraint failed
      return json(400, res, {
        message: "That user has already been invited to this organization.",
      });
    }
    throw e;
  }

  return json(201, res, {});
};
