import { RequestError } from "octokit";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { OrgNotFoundError, RepositoryNotFoundError } from "./errors/index.ts";

export class ListRepoWorkflowsService {
  private orgRepo: OrganizationRepo;

  constructor(orgRepo: OrganizationRepo) {
    this.orgRepo = orgRepo;
  }

  async listRepoWorkflows(orgId: number, userId: number, repoId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: userId },
    });

    if (!org) {
      throw new OrgNotFoundError(null);
    }

    try {
      const gitProvider = await getGitProvider(org.id);
      const workflows = await gitProvider.getWorkflows(repoId);
      return workflows.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        path: workflow.path,
      }));
    } catch (e) {
      if (e instanceof RequestError && e.status === 404) {
        throw new RepositoryNotFoundError();
      }

      throw e;
    }
  }
}
