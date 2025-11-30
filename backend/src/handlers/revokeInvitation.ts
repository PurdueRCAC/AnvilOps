import { db, NotFoundError } from "../db/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const revokeInvitation: HandlerMap["revokeInvitation"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await db.invitation.revoke(
      ctx.request.params.orgId,
      ctx.request.params.invId,
      req.user.id,
    );
  } catch (e) {
    if (e instanceof NotFoundError) {
      return json(404, res, { code: 404, message: "Invitation not found." });
    }
    throw e;
  }

  return json(204, res, {});
};
