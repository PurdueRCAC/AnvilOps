import { ConflictError } from "../db/index.ts";
import {
  OrgNotFoundError,
  UserNotFoundError,
  ValidationError,
} from "../service/common/errors.ts";
import { inviteUser } from "../service/inviteUser.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const inviteUserHandler: HandlerMap["inviteUser"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await inviteUser(
      req.user.id,
      ctx.request.params.orgId,
      ctx.request.requestBody.email,
    );
    return json(201, res, {});
  } catch (e) {
    if (e instanceof UserNotFoundError) {
      return json(404, res, {
        code: 404,
        message:
          "No user was found with that email address. Make sure it is spelled correctly.",
      });
    } else if (e instanceof ValidationError) {
      return json(400, res, {
        code: 400,
        message: e.message,
      });
    } else if (e instanceof OrgNotFoundError) {
      return json(404, res, { code: 404, message: "Organization not found." });
    } else if (e instanceof ConflictError) {
      return json(400, res, {
        code: 400,
        message: "That user has already been invited to this organization.",
      });
    }
    throw e;
  }
};
