import {
  InstallationNotFoundError,
  OrgNotFoundError,
  RepositoryNotFoundError,
} from "../service/common/errors.ts";
import { listRepoBranches } from "../service/listRepoBranches.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const listRepoBranchesHandler: HandlerMap["listRepoBranches"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    const branches = await listRepoBranches(
      ctx.request.params.orgId,
      req.user.id,
      ctx.request.params.repoId,
    );
    return json(200, res, branches);
  } catch (e) {
    if (e instanceof OrgNotFoundError) {
      return json(404, res, { code: 404, message: "Organization not found" });
    } else if (e instanceof InstallationNotFoundError) {
      return json(403, res, { code: 403, message: "GitHub not connected" });
    } else if (e instanceof RepositoryNotFoundError) {
      return json(404, res, { code: 404, message: "Repository not found" });
    }
    throw e;
  }
};
