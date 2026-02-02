import { randomBytes } from "node:crypto";
import type { GitHubOAuthState } from "../db/models.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { UserRepo } from "../db/repo/user.ts";
import {
  PermissionLevel,
  type GitHubOAuthAction,
} from "../generated/prisma/enums.ts";
import { getGitProviderType } from "../lib/git/gitProvider.ts";
import { logger } from "../logger.ts";
import { OrgAlreadyLinkedError, OrgNotFoundError } from "./errors/index.ts";

export class CreateGitHubAppInstallStateService {
  private orgRepo: OrganizationRepo;
  private userRepo: UserRepo;

  constructor(orgRepo: OrganizationRepo, userRepo: UserRepo) {
    this.orgRepo = orgRepo;
    this.userRepo = userRepo;
  }

  async createGitHubAppInstallState(orgId: number, userId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: userId, permissionLevel: PermissionLevel.OWNER },
    });

    if ((await getGitProviderType(orgId)) !== null) {
      throw new OrgAlreadyLinkedError();
    }

    if (org === null) {
      throw new OrgNotFoundError(null);
    }

    logger.info({ userId, orgId }, "GitHub installation flow started (1/3)");
    return await this.createState("CREATE_INSTALLATION", userId, orgId);
  }

  async createState(action: GitHubOAuthAction, userId: number, orgId: number) {
    const random = randomBytes(64).toString("base64url");
    await this.userRepo.setOAuthState(orgId, userId, action, random);
    return random;
  }

  async verifyState(random: string): Promise<GitHubOAuthState> {
    return await this.userRepo.getAndDeleteOAuthState(random);
  }
}
