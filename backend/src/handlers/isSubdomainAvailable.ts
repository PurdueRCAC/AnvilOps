import { ValidationError } from "../service/common/errors.ts";
import { isSubdomainAvailable } from "../service/isSubdomainAvailable.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const isSubdomainAvailableHandler: HandlerMap["isSubdomainAvailable"] =
  async (ctx, req: AuthenticatedRequest, res) => {
    const subdomain = ctx.request.query.subdomain;
    try {
      const available = await isSubdomainAvailable(subdomain);
      return json(200, res, { available });
    } catch (e) {
      if (e instanceof ValidationError) {
        return json(400, res, { code: 400, message: e.message });
      }
      throw e;
    }
  };
