import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { GitProviderFactoryService } from "./common/git/gitProvider.ts";
import { OrgNotFoundError } from "./errors/index.ts";

export class ListOrgReposService {
  private orgRepo: OrganizationRepo;
  private gitProviderFactoryService: GitProviderFactoryService;

  constructor(
    orgRepo: OrganizationRepo,
    gitProviderFactoryService: GitProviderFactoryService,
  ) {
    this.orgRepo = orgRepo;
    this.gitProviderFactoryService = gitProviderFactoryService;
  }

  async listOrgRepos(orgId: number, userId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: userId },
    });

    if (!org) {
      throw new OrgNotFoundError(null);
    }

    const gitProvider = await this.gitProviderFactoryService.getGitProvider(
      org.id,
    );
    const repos = await gitProvider.getAllRepos();

    return repos.map((repo) => ({
      id: repo.id,
      owner: repo.owner,
      name: repo.name,
    }));
  }
}
