import { SpanStatusCode, trace } from "@opentelemetry/api";
import { NotFoundError } from "../db/errors/index.ts";
import type { InvitationRepo } from "../db/repo/invitation.ts";
import { logger } from "../logger.ts";
import { InvitationNotFoundError } from "./errors/index.ts";

export class AcceptInvitationService {
  private invitationRepo: InvitationRepo;

  constructor(invitationRepo: InvitationRepo) {
    this.invitationRepo = invitationRepo;
  }

  async acceptInvitation(
    invitationId: number,
    orgId: number,
    inviteeId: number,
  ) {
    try {
      await this.invitationRepo.accept(invitationId, orgId, inviteeId);
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
}
