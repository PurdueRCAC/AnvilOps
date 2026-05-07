import type { DomainRepo } from "../db/repo/domain.ts";
import type { components } from "../generated/openapi.ts";
import type { CustomDomainService } from "./customDomain.ts";

export class ListDomainsService {
  private domainRepo: DomainRepo;
  private customDomainService: CustomDomainService;

  constructor(
    domainRepo: DomainRepo,
    customDomainService: CustomDomainService,
  ) {
    this.domainRepo = domainRepo;
    this.customDomainService = customDomainService;
  }

  async listDomains(
    appId: number,
    userId: number,
  ): Promise<components["schemas"]["CustomDomain"][]> {
    const domains = await this.domainRepo.listByAppId(appId, {
      requireUser: { id: userId },
    });

    return await Promise.all(
      domains.map(async (d) => {
        return {
          domain: d.name,
          id: d.id,
          appId: d.appId,
          status: d.status,
          updatedAt: d.updatedAt.toISOString(),
          dnsRecords:
            d.status === "UNVERIFIED"
              ? await this.customDomainService.getRequiredDNSRecords(
                  d.name,
                  d.verificationToken,
                )
              : null,
        };
      }),
    );
  }
}
