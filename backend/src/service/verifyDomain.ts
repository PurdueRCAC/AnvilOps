import type { AppRepo } from "../db/repo/app.ts";
import type { DomainRepo } from "../db/repo/domain.ts";
import { logger } from "../logger.ts";
import type { CertGenerationService } from "./certGeneration.ts";
import type { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import { createNamespaceConfig } from "./common/cluster/resources.ts";
import type { IngressConfigService } from "./common/cluster/resources/ingress.ts";
import type { CustomDomainService } from "./customDomain.ts";
import { ValidationError } from "./errors/index.ts";

export class VerifyDomainService {
  private domainRepo: DomainRepo;
  private customDomainService: CustomDomainService;
  private certGenService: CertGenerationService;

  // Used to recreate the Ingress after the domain is verified
  private appRepo: AppRepo;
  private ingressService: IngressConfigService;
  private k8sService: KubernetesClientService;

  constructor(
    appRepo: AppRepo,
    domainRepo: DomainRepo,
    customDomainService: CustomDomainService,
    certGenService: CertGenerationService,
    ingressService: IngressConfigService,
    k8sService: KubernetesClientService,
  ) {
    this.appRepo = appRepo;
    this.domainRepo = domainRepo;
    this.customDomainService = customDomainService;
    this.certGenService = certGenService;
    this.ingressService = ingressService;
    this.k8sService = k8sService;
  }

  async verifyDomain(domainId: number, userId: number) {
    const domain = await this.domainRepo.getById(domainId, {
      requireUser: { id: userId },
    });

    const app = await this.appRepo.getById(domain.appId);
    const config = await this.appRepo.getDeploymentConfig(app.id);
    if (config.appType !== "workload") {
      throw new ValidationError(
        "Custom domains are not supported with this type of application.",
      );
    }

    await this.customDomainService.verifyDNSRecords(
      domain.name,
      domain.verificationToken,
    );

    // If no error was thrown, the domain's DNS records were valid.

    // Create an Ingress rule that works for the new hostname
    const domains = await this.domainRepo.listByAppId(app.id);
    const namespace = createNamespaceConfig(app.namespace, app.projectId);
    const ingress = this.ingressService.createIngressConfig({
      createIngress: config.createIngress,
      customDomains: domains,
      name: app.name,
      namespace: app.namespace,
      port: config.port,
      serviceName: app.namespace,
      subdomain: config.subdomain,
      servicePort: 80,
    });
    await this.k8sService.createOrUpdateApp(app, namespace, [ingress]);

    // Begin generating a certificate for the domain
    await this.domainRepo.setStatus(domainId, "PENDING");

    try {
      await this.certGenService.generateCert(domain.id);
    } catch (e) {
      logger.error(e, "Failed to submit certificate order");
      await this.domainRepo.setStatus(domainId, "ERROR");
    }
  }
}
