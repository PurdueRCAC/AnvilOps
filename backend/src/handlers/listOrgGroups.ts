import { OrgNotFoundError } from "../service/common/errors.ts";
import { listOrgGroups } from "../service/listOrgGroups.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const listOrgGroupsHandler: HandlerMap["listOrgGroups"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const orgId = ctx.request.params.orgId;

  try {
    const groups = await listOrgGroups(orgId, req.user.id);
    return json(200, res, groups);
  } catch (e) {
    if (e instanceof OrgNotFoundError) {
      return json(404, res, { code: 404, message: "Organization not found." });
    }
    throw e;
  }
};
