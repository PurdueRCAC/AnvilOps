import { InstallationNotFoundError } from "../lib/octokit.ts";
import { claimOrg } from "../service/claimOrg.ts";
import { OrgNotFoundError } from "../service/common/errors.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const claimOrgHandler: HandlerMap["claimOrg"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const unassignedInstallationId =
    ctx.request.requestBody.unclaimedInstallationId;
  const orgId = ctx.request.params.orgId;
  try {
    await claimOrg(orgId, unassignedInstallationId, req.user.id);
  } catch (e) {
    if (e instanceof InstallationNotFoundError) {
      return json(404, res, {
        code: 404,
        message: "Installation does not exist.",
      });
    } else if (e instanceof OrgNotFoundError) {
      return json(404, res, {
        code: 404,
        message: "Organization does not exist.",
      });
    }
    throw e;
  }
  return json(200, res, {});
};
