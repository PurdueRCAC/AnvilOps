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
  if (ctx.request.query.probe) {
    // This request is coming from AnvilOps in backend/src/service/verifyDomain.ts to make sure the challenge is ready before telling Let's Encrypt to complete it.
    return unsafeGenericResponse(res.send("200 OK").end());
  }
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
