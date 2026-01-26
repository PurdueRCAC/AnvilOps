import { OrgNotFoundError } from "../service/common/errors.ts";
import { deleteOrgByID } from "../service/deleteOrgByID.ts";
import { empty, json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const deleteOrgByIDHandler: HandlerMap["deleteOrgByID"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await deleteOrgByID(ctx.request.params.orgId, req.user.id);
  } catch (e) {
    if (e instanceof OrgNotFoundError) {
      return json(404, res, { code: 404, message: "Organization not found." });
    } else {
      throw e;
    }
  }

  return empty(200, res);
};
