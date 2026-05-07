import { ApiException } from "@kubernetes/client-node";
import type { AppRepo } from "../db/repo/app.ts";
import type { DomainRepo } from "../db/repo/domain.ts";
import type { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import { createNamespaceConfig } from "./common/cluster/resources.ts";
import type { IngressConfigService } from "./common/cluster/resources/ingress.ts";
import { DomainNotFoundError, ValidationError } from "./errors/index.ts";

export class RemoveDomainService {
  private domainRepo: DomainRepo;

  private appRepo: AppRepo;
  private ingressService: IngressConfigService;
  private k8sService: KubernetesClientService;

  constructor(
    domainRepo: DomainRepo,
    appRepo: AppRepo,
    ingressService: IngressConfigService,
    k8sService: KubernetesClientService,
  ) {
    this.domainRepo = domainRepo;
    this.appRepo = appRepo;
    this.ingressService = ingressService;
    this.k8sService = k8sService;
  }

  async removeDomain(domainId: number, userId: number) {
    const domain = await this.domainRepo.getById(domainId, {
      requireUser: { id: userId },
    });
    if (!domain) {
      throw new DomainNotFoundError();
    }

    const app = await this.appRepo.getById(domain.appId);
    const config = await this.appRepo.getDeploymentConfig(domain.appId);
    if (config.appType !== "workload") {
      throw new ValidationError(
        "Custom domains are not supported on this app type.",
      );
    }

    // Remove the Ingress rule that directs traffic from the custom domain to the app
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

    // Remove the Secret that stores the TLS certificate
    try {
      const { CoreV1Api: api } = await this.k8sService.getClientsForRequest(
        userId,
        app.projectId,
        ["CoreV1Api"],
      );
      await api.deleteNamespacedSecret({
        namespace: app.namespace,
        name: `anvilops-tls-${domain.id}`,
      });
    } catch (e) {
      if (e instanceof ApiException && e.code === 404) {
        // The Secret doesn't exist, which is fine since we're deleting
      } else {
        throw e;
      }
    }

    // Remove the DB record associated with the domain
    await this.domainRepo.delete(domainId, { requireUser: { id: userId } });
  }
}
