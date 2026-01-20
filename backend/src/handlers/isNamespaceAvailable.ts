import { ValidationError } from "../service/common/errors.ts";
import { isNamespaceAvailable } from "../service/isNamespaceAvailable.ts";
import { json, type HandlerMap } from "../types.ts";

export const isNamespaceAvailableHandler: HandlerMap["isNamespaceAvailable"] =
  async (ctx, req, res) => {
    try {
      const available = await isNamespaceAvailable(ctx.request.query.namespace);
      return json(200, res, { available });
    } catch (e) {
      if (e instanceof ValidationError) {
        return json(400, res, { code: 400, message: e.message });
      }
      throw e;
    }
  };
