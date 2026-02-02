import type { AppGroupRepo } from "../db/repo/appGroup.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { OrgNotFoundError } from "./errors/index.ts";

export class ListOrgGroupsService {
  private orgRepo: OrganizationRepo;
  private appGroupRepo: AppGroupRepo;

  constructor(orgRepo: OrganizationRepo, appGroupRepo: AppGroupRepo) {
    this.orgRepo = orgRepo;
    this.appGroupRepo = appGroupRepo;
  }

  async listOrgGroups(orgId: number, userId: number) {
    const [org, appGroups] = await Promise.all([
      this.orgRepo.getById(orgId, { requireUser: { id: userId } }),
      this.appGroupRepo.listForOrg(orgId),
    ]);

    if (org === null) {
      throw new OrgNotFoundError(null);
    }

    return appGroups.map((group) => ({
      id: group.id,
      name: group.name,
      isMono: group.isMono,
    }));
  }
}
