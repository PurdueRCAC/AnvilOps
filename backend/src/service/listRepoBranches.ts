import { RequestError } from "octokit";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { OrgNotFoundError, RepositoryNotFoundError } from "./errors/index.ts";

export class ListRepoBranchesService {
  private orgRepo: OrganizationRepo;

  constructor(orgRepo: OrganizationRepo) {
    this.orgRepo = orgRepo;
  }

  async listRepoBranches(orgId: number, userId: number, repoId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: userId },
    });

    if (!org) {
      throw new OrgNotFoundError(null);
    }

    try {
      const gitProvider = await getGitProvider(org.id);
      const branches = await gitProvider.getBranches(repoId);

      return {
        default: branches.defaultBranch,
        branches: branches.names,
      };
    } catch (e) {
      if (e instanceof RequestError && e.status == 404) {
        throw new RepositoryNotFoundError();
      }

      throw e;
    }
  }
}
