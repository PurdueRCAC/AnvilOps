import { NotFoundError } from "../db/errors/index.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { logger } from "../logger.ts";
import { OrgNotFoundError, UserNotFoundError } from "./errors/index.ts";

export class RemoveUserFromOrgService {
  private orgRepo: OrganizationRepo;

  constructor(orgRepo: OrganizationRepo) {
    this.orgRepo = orgRepo;
  }

  async removeUserFromOrg(orgId: number, actorId: number, userId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: actorId, permissionLevel: "OWNER" },
    });

    if (!org) {
      throw new OrgNotFoundError(null);
    }

    try {
      await this.orgRepo.removeMember(orgId, userId);
      logger.info(
        { orgId, userId: actorId, removedUserId: userId },
        "User removed from organization",
      );
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw new UserNotFoundError();
      }

      throw e;
    }
  }
}
