import type { OrganizationRepo } from "../db/repo/organization.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { OrgNotFoundError } from "./errors/index.ts";

export class ListOrgReposService {
  private orgRepo: OrganizationRepo;

  constructor(orgRepo: OrganizationRepo) {
    this.orgRepo = orgRepo;
  }

  async listOrgRepos(orgId: number, userId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: userId },
    });

    if (!org) {
      throw new OrgNotFoundError(null);
    }

    const gitProvider = await getGitProvider(org.id);
    const repos = await gitProvider.getAllRepos();

    return repos.map((repo) => ({
      id: repo.id,
      owner: repo.owner,
      name: repo.name,
    }));
  }
}
