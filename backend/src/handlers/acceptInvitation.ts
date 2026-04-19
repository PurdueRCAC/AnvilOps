import { InvitationNotFoundError } from "../service/errors/index.ts";
import { acceptInvitationService } from "../service/index.ts";
import { empty, json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const acceptInvitationHandler: HandlerMap["acceptInvitation"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await acceptInvitationService.acceptInvitation(
      ctx.request.params.invId,
      ctx.request.params.orgId,
      req.user.id,
    );
  } catch (e) {
    if (e instanceof InvitationNotFoundError) {
      return json(404, res, { code: 404, message: "Invitation not found." });
    }
    throw e;
  }

  return empty(204, res);
};
