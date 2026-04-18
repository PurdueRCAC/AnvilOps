import type { AppRepo } from "../db/repo/app.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { logger } from "../logger.ts";
import { type DeleteAppService } from "./deleteApp.ts";
import { OrgNotFoundError } from "./errors/index.ts";

export class DeleteOrgByIDService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private deleteAppService: DeleteAppService;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    deleteAppService: DeleteAppService,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.deleteAppService = deleteAppService;
  }

  async deleteOrgByID(orgId: number, userId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: userId, permissionLevel: "OWNER" },
    });

    if (!org) {
      throw new OrgNotFoundError(null);
    }

    const apps = await this.appRepo.listForOrg(orgId);

    await Promise.all(
      apps.map(
        async (app) =>
          await this.deleteAppService.deleteApp(app.id, userId, false),
      ),
    );

    await this.orgRepo.delete(orgId);
    logger.info({ orgId, userId }, "Organization deleted");
  }
}
