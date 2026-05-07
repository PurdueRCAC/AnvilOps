import { ValidationError } from "../service/errors/index.ts";
import { verifyDomainService } from "../service/index.ts";
import { empty, json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const verifyDomainHandler: HandlerMap["verifyDomain"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await verifyDomainService.verifyDomain(
      ctx.request.params.domainId,
      req.user.id,
    );
  } catch (e) {
    if (e instanceof ValidationError) {
      return json(400, res, {
        code: 400,
        message:
          "Couldn't find the expected DNS records. Make sure they are correct and try again in a few minutes.",
      });
    }
    throw e;
  }

  return empty(200, res);
};
