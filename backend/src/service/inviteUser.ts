import { ConflictError, NotFoundError } from "../db/errors/index.ts";
import type { InvitationRepo } from "../db/repo/invitation.ts";
import type { UserRepo } from "../db/repo/user.ts";
import { logger } from "../logger.ts";
import {
  OrgNotFoundError,
  UserNotFoundError,
  ValidationError,
} from "./errors/index.ts";

export class InviteUserService {
  private userRepo: UserRepo;
  private invitationRepo: InvitationRepo;

  constructor(userRepo: UserRepo, invitationRepo: InvitationRepo) {
    this.userRepo = userRepo;
    this.invitationRepo = invitationRepo;
  }

  async inviteUser(inviterId: number, orgId: number, inviteeEmail: string) {
    const otherUser = await this.userRepo.getByEmail(inviteeEmail);

    if (otherUser === null) {
      throw new UserNotFoundError();
    }

    if (otherUser.id === inviterId) {
      throw new ValidationError("You cannot send an invitation to yourself.");
    }

    try {
      await this.invitationRepo.send(orgId, inviterId, otherUser.id);
      logger.info(
        { orgId, inviterId, inviteeId: otherUser.id },
        "Organization invitation sent",
      );
    } catch (e) {
      if (e instanceof NotFoundError && e.message === "organization") {
        throw new OrgNotFoundError(null);
      }
      if (e instanceof ConflictError && e.message === "user") {
        throw new ConflictError("user");
      }
      throw e;
    }
  }
}
