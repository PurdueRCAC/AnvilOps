import {
  DomainNotFoundError,
  ValidationError,
} from "../service/errors/index.ts";
import { certGenerationService } from "../service/index.ts";
import { unsafeGenericResponse, type HandlerMap } from "../types.ts";

export const handleAcmeChallengeHandler: HandlerMap["acmeChallenge"] = async (
  ctx,
  req,
  res,
) => {
  try {
    const keyAuthorization = await certGenerationService.handleAcmeChallenge(
      ctx.request.params.token,
    );
    return unsafeGenericResponse(res.send(keyAuthorization).end());
  } catch (e) {
    if (e instanceof DomainNotFoundError) {
      return unsafeGenericResponse(res.send("Domain not found").end());
    } else if (e instanceof ValidationError) {
      return unsafeGenericResponse(res.send(e.message).end());
    }
    throw e;
  }
};
