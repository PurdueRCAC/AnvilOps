import { listDomainsService } from "../service/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const listDomainsHandler: HandlerMap["listDomains"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return json(200, res, {
    domains: await listDomainsService.listDomains(
      ctx.request.params.appId,
      req.user.id,
    ),
  });
};
