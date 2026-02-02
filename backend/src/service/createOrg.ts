import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { Organization } from "../db/models.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { logger } from "../logger.ts";

export class CreateOrgService {
  private orgRepo: OrganizationRepo;
  constructor(orgRepo: OrganizationRepo) {
    this.orgRepo = orgRepo;
  }

  async createOrg(name: string, firstUserId: number): Promise<Organization> {
    try {
      const org = await this.orgRepo.create(name, firstUserId);
      logger.info({ name, firstUserId, orgId: org.id }, "Organization created");
      return org;
    } catch (err) {
      const span = trace.getActiveSpan();
      span?.recordException(err as Error);
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: "Failed to create organization",
      });
      throw err;
    }
  }
}
