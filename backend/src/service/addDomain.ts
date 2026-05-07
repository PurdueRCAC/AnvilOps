import type { DomainRepo } from "../db/repo/domain.ts";
import type { CustomDomainService } from "./customDomain.ts";

export class AddDomainService {
  private domainRepo: DomainRepo;
  private customDomainService: CustomDomainService;

  constructor(
    domainRepo: DomainRepo,
    customDomainService: CustomDomainService,
  ) {
    this.domainRepo = domainRepo;
    this.customDomainService = customDomainService;
  }

  async addDomain(appId: number, domainName: string) {
    this.customDomainService.validateDomainName(domainName);
    return await this.domainRepo.create(appId, domainName);
  }
}
