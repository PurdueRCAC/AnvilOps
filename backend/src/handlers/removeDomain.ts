import { DomainNotFoundError } from "../service/errors/index.ts";
import { removeDomainService } from "../service/index.ts";
import { empty, type HandlerMap } from "../types.ts";

export const removeDomainHandler: HandlerMap["removeDomain"] = async (
  ctx,
  req,
  res,
) => {
  try {
    await removeDomainService.removeDomain(
      ctx.request.params.domainId,
      req.user.id,
    );
  } catch (e) {
    if (e instanceof DomainNotFoundError) {
      return empty(404, res);
    }

    throw e;
  }

  return empty(204, res);
};
