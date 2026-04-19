import {
  InstallationNotFoundError,
  OrgNotFoundError,
} from "../service/errors/index.ts";
import { getInstallationService } from "../service/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getInstallationHandler: HandlerMap["getInstallation"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    const installation = await getInstallationService.getInstallation(
      ctx.request.params.orgId,
      req.user.id,
    );
    return json(200, res, installation);
  } catch (e) {
    if (e instanceof OrgNotFoundError) {
      return json(404, res, { code: 404, message: "Organization not found." });
    } else if (e instanceof InstallationNotFoundError) {
      return json(404, res, {
        code: 404,
        message: "GitHub app not installed.",
      });
    }
    throw e;
  }
};
