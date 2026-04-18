import { SpanStatusCode, trace } from "@opentelemetry/api";
import { NotFoundError } from "../db/errors/index.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { logger } from "../logger.ts";
import { InstallationNotFoundError, OrgNotFoundError } from "./errors/index.ts";

export class ClaimOrgService {
  private orgRepo: OrganizationRepo;

  constructor(orgRepo: OrganizationRepo) {
    this.orgRepo = orgRepo;
  }
  async claimOrg(
    orgId: number,
    unassignedInstallationId: number,
    userId: number,
  ) {
    try {
      await this.orgRepo.claimInstallation(
        orgId,
        unassignedInstallationId,
        userId,
      );
      logger.info(
        { orgId, unassignedInstallationId, userId },
        "Installation claimed",
      );
    } catch (e) {
      if (e instanceof NotFoundError) {
        switch (e.message) {
          case "installation":
            throw new InstallationNotFoundError(e);
          case "organization":
            throw new OrgNotFoundError(e);
          default:
            throw e;
        }
      }

      const span = trace.getActiveSpan();
      span?.recordException(e as Error);
      span?.setStatus({ code: SpanStatusCode.ERROR });

      throw e;
    }
  }
}
