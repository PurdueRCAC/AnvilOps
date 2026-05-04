import {
  PrivateSuffixError,
  ValidationError,
} from "../service/errors/index.ts";
import { addDomainService } from "../service/index.ts";
import { empty, json, type HandlerMap } from "../types.ts";

export const addDomainHandler: HandlerMap["addDomain"] = async (
  ctx,
  req,
  res,
) => {
  try {
    await addDomainService.addDomain(
      ctx.request.params.appId,
      ctx.request.requestBody.name,
    );
  } catch (e) {
    if (e instanceof ValidationError) {
      return json(400, res, { code: 400, message: e.message });
    } else if (e instanceof PrivateSuffixError) {
      return json(400, res, {
        code: 400,
        message:
          "This domain uses a private suffix. To verify a domain, you must own its base name.",
      });
    }
    throw e;
  }
  return empty(201, res);
};
