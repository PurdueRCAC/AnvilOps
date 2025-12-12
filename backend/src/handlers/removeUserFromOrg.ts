import {
  OrgNotFoundError,
  UserNotFoundError,
} from "../service/common/errors.ts";
import { removeUserFromOrg } from "../service/removeUserFromOrg.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const removeUserFromOrgHandler: HandlerMap["removeUserFromOrg"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await removeUserFromOrg(
      ctx.request.params.orgId,
      req.user.id,
      ctx.request.params.userId,
    );
    return json(204, res, {});
  } catch (e) {
    if (e instanceof OrgNotFoundError) {
      return json(403, res, {});
    } else if (e instanceof UserNotFoundError) {
      return json(404, res, { code: 404, message: "Not found." });
    }
    throw e;
  }
};
