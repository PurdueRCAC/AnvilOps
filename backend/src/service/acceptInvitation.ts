import { SpanStatusCode, trace } from "@opentelemetry/api";
import { db, NotFoundError } from "../db/index.ts";
import { logger } from "../logger.ts";
import { InvitationNotFoundError } from "./errors/index.ts";

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
