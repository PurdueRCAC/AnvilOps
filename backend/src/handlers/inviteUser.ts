import { ConflictError, db, NotFoundError } from "../db/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const inviteUser: HandlerMap["inviteUser"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const otherUser = await db.user.getByEmail(ctx.request.requestBody.email);

  if (otherUser === null) {
    return json(404, res, {
      code: 404,
      message:
        "No user was found with that email address. Make sure it is spelled correctly.",
    });
  }

  if (otherUser.id === req.user.id) {
    return json(400, res, {
      code: 400,
      message: "You cannot send an invitation to yourself.",
    });
  }

  try {
    await db.invitation.send(
      ctx.request.params.orgId,
      req.user.id,
      otherUser.id,
    );
  } catch (e: any) {
    if (e instanceof NotFoundError && e.message === "organization") {
      return json(404, res, { code: 404, message: "Organization not found." });
    }
    if (e instanceof ConflictError && e.message === "user") {
      return json(400, res, {
        code: 400,
        message: "That user has already been invited to this organization.",
      });
    }
    throw e;
  }

  return json(201, res, {});
};
