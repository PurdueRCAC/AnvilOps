import { OrgNotFoundError } from "../service/common/errors.ts";
import { getOrgByID } from "../service/getOrgByID.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getOrgByIDHandler: HandlerMap["getOrgByID"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    const org = await getOrgByID(ctx.request.params.orgId, req.user.id);
    return json(200, res, org);
  } catch (e) {
    if (e instanceof OrgNotFoundError) {
      return json(404, res, {
        code: 404,
        message: "Organization not found.",
      });
    }
    throw e;
  }
};
