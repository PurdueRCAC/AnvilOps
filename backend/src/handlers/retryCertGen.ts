import { ValidationError } from "../service/errors/index.ts";
import { retryCertGenService } from "../service/index.ts";
import { empty, json, type HandlerMap } from "../types.ts";

export const retryCertGenHandler: HandlerMap["retryCertGen"] = async (
  ctx,
  req,
  res,
) => {
  try {
    await retryCertGenService.retryCertGen(
      req.user.id,
      ctx.request.params.domainId,
    );
  } catch (e) {
    if (e instanceof ValidationError) {
      return json(400, res, { code: 400, message: e.message });
    }
    throw e;
  }
  return empty(200, res);
};
