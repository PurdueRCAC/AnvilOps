import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { GitProviderFactoryService } from "./common/git/gitProvider.ts";
import { OrgNotFoundError } from "./errors/index.ts";

export class GetInstallationService {
  private orgRepo: OrganizationRepo;
  private gitProviderFactoryService: GitProviderFactoryService;

  constructor(
    orgRepo: OrganizationRepo,
    gitProviderFactoryService: GitProviderFactoryService,
  ) {
    this.orgRepo = orgRepo;
    this.gitProviderFactoryService = gitProviderFactoryService;
  }

  async getInstallation(orgId: number, userId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: userId },
    });

    if (!org) {
      throw new OrgNotFoundError(null);
    }

    const gitProvider = await this.gitProviderFactoryService.getGitProvider(
      org.id,
    );
    const installation = await gitProvider.getInstallationInfo();

    return {
      hasAllRepoAccess: installation.hasAllRepoAccess,
      targetId: installation.targetId,
      targetType: installation.targetType,
      targetName: installation.targetName,
    };
  }
}
