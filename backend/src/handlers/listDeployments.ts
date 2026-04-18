import { AppNotFoundError, ValidationError } from "../service/errors/index.ts";
import { listDeploymentsService } from "../service/index.ts";
import { empty, json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const listDeploymentsHandler: HandlerMap["listDeployments"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const page = ctx.request.query.page ?? 0;
  const pageLength = ctx.request.query.length ?? 25;
  try {
    const deployments = await listDeploymentsService.listDeployments(
      ctx.request.params.appId,
      req.user.id,
      page,
      pageLength,
    );
    return json(200, res, deployments);
  } catch (e) {
    if (e instanceof AppNotFoundError) {
      return empty(404, res);
    } else if (e instanceof ValidationError) {
      return json(400, res, { code: 400, message: e.message });
    }
    throw e;
  }
};
