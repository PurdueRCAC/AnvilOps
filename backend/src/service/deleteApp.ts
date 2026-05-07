import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { AppRepo } from "../db/repo/app.ts";
import type { AppGroupRepo } from "../db/repo/appGroup.ts";
import type { DeploymentRepo } from "../db/repo/deployment.ts";
import type { DomainRepo } from "../db/repo/domain.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { logger } from "../logger.ts";
import type { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import type { ClusterResourcesService } from "./common/cluster/resources.ts";
import type { RegistryService } from "./common/registry.ts";
import { AppNotFoundError } from "./errors/index.ts";

export class DeleteAppService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private appGroupRepo: AppGroupRepo;
  private deploymentRepo: DeploymentRepo;
  private registryService: RegistryService;
  private clusterResourcesService: ClusterResourcesService;
  private kubernetesService: KubernetesClientService;
  private domainRepo: DomainRepo;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    appGroupRepo: AppGroupRepo,
    deploymentRepo: DeploymentRepo,
    domainRepo: DomainRepo,
    registryService: RegistryService,
    clusterResourcesService: ClusterResourcesService,
    kubernetesService: KubernetesClientService,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.appGroupRepo = appGroupRepo;
    this.deploymentRepo = deploymentRepo;
    this.domainRepo = domainRepo;
    this.registryService = registryService;
    this.clusterResourcesService = clusterResourcesService;
    this.kubernetesService = kubernetesService;
  }

  async deleteApp(appId: number, userId: number, keepNamespace: boolean) {
    const app = await this.appRepo.getById(appId);

    // Check permission
    const org = await this.orgRepo.getById(app.orgId, {
      requireUser: { id: userId, permissionLevel: "OWNER" },
    });
    if (!org) {
      throw new AppNotFoundError();
    }

    const { namespace, projectId, imageRepo } = app;
    const lastDeployment = await this.appRepo.getMostRecentDeployment(appId);
    const config = await this.deploymentRepo.getConfig(lastDeployment.id);

    if (!keepNamespace) {
      const { KubernetesObjectApi: api } =
        await this.kubernetesService.getClientsForRequest(userId, projectId, [
          "KubernetesObjectApi",
        ]);
      try {
        await this.kubernetesService.deleteNamespace(api, namespace);
      } catch (err) {
        logger.warn({ namespace }, "Failed to delete namespace");
        const span = trace.getActiveSpan();
        span?.recordException(err as Error);
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Failed to delete namespace",
        });
      }

      try {
        if (imageRepo) await this.registryService.deleteRepo(imageRepo);
      } catch (err) {
        logger.warn({ imageRepo }, "Failed to delete image repository");
        const span = trace.getActiveSpan();
        span?.recordException(err as Error);
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Failed to delete image repository",
        });
      }
    } else if (config.appType === "workload") {
      // Redeploy without the log shipper and without anvilops-related labels
      config.collectLogs = false; // <-- Disable log shipping

      const app = await this.appRepo.getById(lastDeployment.appId);
      const [org, appGroup, domains] = await Promise.all([
        this.orgRepo.getById(app.orgId),
        this.appGroupRepo.getById(app.appGroupId),
        this.domainRepo.listByAppId(app.id),
      ]);

      const { namespace, configs, postCreate } =
        await this.clusterResourcesService.createAppConfigsFromDeployment({
          org,
          app,
          appGroup,
          deployment: lastDeployment,
          config,
          customDomains: domains,
          migrating: true, // Deploy without any anvilops-related labels
        });

      await this.kubernetesService.createOrUpdateApp(
        app,
        namespace,
        configs,
        postCreate,
      );
    }

    await this.appRepo.delete(appId);
    logger.info(
      { appId, userId, imageRepo, namespace, keepNamespace },
      "App deleted",
    );
  }
}
