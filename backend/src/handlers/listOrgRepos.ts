import {
  InstallationNotFoundError,
  OrgNotFoundError,
} from "../service/common/errors.ts";
import { listOrgRepos } from "../service/listOrgRepos.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const listOrgReposHandler: HandlerMap["listOrgRepos"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    const data = await listOrgRepos(ctx.request.params.orgId, req.user.id);
    return json(200, res, data);
  } catch (e) {
    if (e instanceof OrgNotFoundError) {
      return json(404, res, { code: 404, message: "Organization not found." });
    } else if (e instanceof InstallationNotFoundError) {
      return json(403, res, { code: 403, message: "GitHub not connected" });
    }
    throw e;
  }
};
