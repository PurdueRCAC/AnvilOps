import { ValidationError } from "../service/errors/index.ts";
import { isSubdomainAvailableService } from "../service/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const isSubdomainAvailableHandler: HandlerMap["isSubdomainAvailable"] =
  async (ctx, req: AuthenticatedRequest, res) => {
    const subdomain = ctx.request.query.subdomain;
    try {
      const available =
        await isSubdomainAvailableService.isSubdomainAvailable(subdomain);
      return json(200, res, { available });
    } catch (e) {
      if (e instanceof ValidationError) {
        return json(400, res, { code: 400, message: e.message });
      }
      throw e;
    }
  };
