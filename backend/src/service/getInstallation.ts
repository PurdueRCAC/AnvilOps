import type { OrganizationRepo } from "../db/repo/organization.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { OrgNotFoundError } from "./errors/index.ts";

export class GetInstallationService {
  private orgRepo: OrganizationRepo;

  constructor(orgRepo: OrganizationRepo) {
    this.orgRepo = orgRepo;
  }

  async getInstallation(orgId: number, userId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: userId },
    });

    if (!org) {
      throw new OrgNotFoundError(null);
    }

    const gitProvider = await getGitProvider(org.id);
    const installation = await gitProvider.getInstallationInfo();

    return {
      hasAllRepoAccess: installation.hasAllRepoAccess,
      targetId: installation.targetId,
      targetType: installation.targetType,
      targetName: installation.targetName,
    };
  }
}
