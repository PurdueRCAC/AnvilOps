import { SpanStatusCode, trace } from "@opentelemetry/api";
import { db, NotFoundError } from "../db/index.ts";
import { logger } from "../index.ts";
import { InvitationNotFoundError } from "./common/errors.ts";

export async function acceptInvitation(
  invitationId: number,
  orgId: number,
  inviteeId: number,
) {
  try {
    await db.invitation.accept(invitationId, orgId, inviteeId);
    logger.info({ invitationId, orgId, inviteeId }, "Invitation accepted");
  } catch (e) {
    if (e instanceof NotFoundError) {
      throw new InvitationNotFoundError(e);
    }

    const span = trace.getActiveSpan();
    span?.recordException(e as Error);
    span?.setStatus({ code: SpanStatusCode.ERROR });

    throw e;
  }
}
