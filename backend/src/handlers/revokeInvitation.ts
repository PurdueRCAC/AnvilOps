import { InvitationNotFoundError } from "../service/common/errors.ts";
import { revokeInvitation } from "../service/revokeInvitation.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const revokeInvitationHandler: HandlerMap["revokeInvitation"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await revokeInvitation(
      ctx.request.params.orgId,
      req.user.id,
      ctx.request.params.invId,
    );

    return json(204, res, {});
  } catch (e) {
    if (e instanceof InvitationNotFoundError) {
      return json(404, res, { code: 404, message: "Invitation not found." });
    }
    throw e;
  }
};
