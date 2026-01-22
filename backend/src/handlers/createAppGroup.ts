import {
  AppCreateError,
  DeploymentError,
  OrgNotFoundError,
  ValidationError,
} from "../service/common/errors.ts";
import { createAppGroup } from "../service/createAppGroup.ts";
import { empty, json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const createAppGroupHandler: HandlerMap["createAppGroup"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const data = ctx.request.requestBody;

  try {
    await createAppGroup(req.user.id, data.orgId, data.name, data.apps);
    return empty(200, res);
  } catch (e) {
    if (e instanceof AppCreateError) {
      const ex = e.cause!;
      if (ex instanceof OrgNotFoundError) {
        return json(400, res, { code: 400, message: "Organization not found" });
      } else if (ex instanceof ValidationError) {
        return json(400, res, {
          code: 400,
          message: ex.message,
        });
      } else if (ex instanceof DeploymentError) {
        // The app was created, but a Deployment couldn't be created
        return json(500, res, {
          code: 500,
          message: `Failed to create a deployment for ${e.appName}.`,
        });
      } else {
        console.error(ex);
        return json(500, res, {
          code: 500,
          message: `There was a problem creating ${e.appName}.`,
        });
      }
    } else if (e instanceof ValidationError) {
      return json(400, res, {
        code: 400,
        message: e.message,
      });
    }
    throw e;
  }
};
