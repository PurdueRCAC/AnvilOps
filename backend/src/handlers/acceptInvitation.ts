import { db, NotFoundError } from "../db/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const acceptInvitation: HandlerMap["acceptInvitation"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await db.invitation.accept(
      ctx.request.params.invId,
      ctx.request.params.orgId,
      req.user.id,
    );
  } catch (e: any) {
    if (e instanceof NotFoundError) {
      return json(404, res, { code: 404, message: "Invitation not found." });
    }
    throw e;
  }

  return json(200, res, {});
};
