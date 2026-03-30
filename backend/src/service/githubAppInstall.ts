import { randomBytes } from "node:crypto";
import type { GitHubOAuthState } from "../db/models.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { UserRepo } from "../db/repo/user.ts";
import {
  PermissionLevel,
  type GitHubOAuthAction,
} from "../generated/prisma/enums.ts";
import { env } from "../lib/env.ts";
import { logger } from "../logger.ts";
import type { GitProviderFactoryService } from "./common/git/gitProvider.ts";
import { OrgAlreadyLinkedError, OrgNotFoundError } from "./errors/index.ts";

export class CreateGitHubAppInstallStateService {
  private orgRepo: OrganizationRepo;
  private userRepo: UserRepo;
  private gitProviderFactoryService: GitProviderFactoryService;

  constructor(
    orgRepo: OrganizationRepo,
    userRepo: UserRepo,
    gitProviderFactoryService: GitProviderFactoryService,
  ) {
    this.orgRepo = orgRepo;
    this.userRepo = userRepo;
    this.gitProviderFactoryService = gitProviderFactoryService;
  }

  async createGitHubAppInstallURL(orgId: number, userId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: userId, permissionLevel: PermissionLevel.OWNER },
    });

    if (
      (await this.gitProviderFactoryService.getGitProviderType(orgId)) !== null
    ) {
      throw new OrgAlreadyLinkedError();
    }

    if (org === null) {
      throw new OrgNotFoundError(null);
    }

    logger.info({ userId, orgId }, "GitHub installation flow started (1/3)");
    const newState = await this.createState(
      "CREATE_INSTALLATION",
      userId,
      orgId,
    );
    return `${env.GITHUB_BASE_URL}/github-apps/${env.GITHUB_APP_NAME}/installations/new?state=${newState}`;
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
