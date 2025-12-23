import { acceptInvitation } from "../service/acceptInvitation.ts";
import { InvitationNotFoundError } from "../service/common/errors.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const acceptInvitationHandler: HandlerMap["acceptInvitation"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await acceptInvitation(
      ctx.request.params.invId,
      ctx.request.params.orgId,
      req.user.id,
    );
  } catch (e: any) {
    if (e instanceof InvitationNotFoundError) {
      return json(404, res, { code: 404, message: "Invitation not found." });
    }
    throw e;
  }

  return json(200, res, {});
};
