import type { AppRepo } from "../db/repo/app.ts";
import { isRFC1123 } from "../lib/validate.ts";
import { type IngressConfigService } from "./common/cluster/resources/ingress.ts";
import { ValidationError } from "./errors/index.ts";

export class IsSubdomainAvailableService {
  private appRepo: AppRepo;
  private ingressConfigService: IngressConfigService;

  constructor(appRepo: AppRepo, ingressConfigService: IngressConfigService) {
    this.appRepo = appRepo;
    this.ingressConfigService = ingressConfigService;
  }

  async isSubdomainAvailable(subdomain: string) {
    if (!isRFC1123(subdomain)) {
      throw new ValidationError("Invalid subdomain.");
    }

    const [appUsingSubdomain, ingressDryRun] = await Promise.all([
      this.appRepo.getAppBySubdomain(subdomain),
      this.ingressConfigService.canCreateIngress(subdomain),
    ]);

    return appUsingSubdomain === null && ingressDryRun;
  }
}
