import { NotFoundError } from "../db/errors/index.ts";
import type { InvitationRepo } from "../db/repo/invitation.ts";
import { logger } from "../logger.ts";
import { InvitationNotFoundError } from "./errors/index.ts";

export class RevokeInvitationService {
  private invitationRepo: InvitationRepo;

  constructor(invitationRepo: InvitationRepo) {
    this.invitationRepo = invitationRepo;
  }

  async revokeInvitation(orgId: number, userId: number, invitationId: number) {
    try {
      await this.invitationRepo.revoke(orgId, invitationId, userId);
      logger.info(
        { invitationId, userId, orgId },
        "Organization invitation revoked",
      );
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw new InvitationNotFoundError(e);
      }
      throw e;
    }
  }
}
