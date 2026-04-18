import type { V1Pod, V1PodList } from "@kubernetes/client-node";
import type { AppRepo } from "../db/repo/app.ts";
import type { DeploymentRepo } from "../db/repo/deployment.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import type { DeploymentConfigService } from "./common/deploymentConfig.ts";
import type { GitProviderFactoryService } from "./common/git/gitProvider.ts";
import { DeploymentNotFoundError } from "./errors/index.ts";

export class GetDeploymentService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private deploymentRepo: DeploymentRepo;
  private deploymentConfigService: DeploymentConfigService;
  private gitProviderFactoryService: GitProviderFactoryService;
  private kubernetesClientService: KubernetesClientService;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    deploymentRepo: DeploymentRepo,
    deploymentConfigService: DeploymentConfigService,
    gitProviderFactoryService: GitProviderFactoryService,
    kubernetesClientService: KubernetesClientService,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.deploymentRepo = deploymentRepo;
    this.deploymentConfigService = deploymentConfigService;
    this.gitProviderFactoryService = gitProviderFactoryService;
    this.kubernetesClientService = kubernetesClientService;
  }

  async getDeployment(deploymentId: number, userId: number) {
    const deployment = await this.deploymentRepo.getById(deploymentId, {
      requireUser: { id: userId },
    });

    if (!deployment) {
      throw new DeploymentNotFoundError();
    }

    const [config, app] = await Promise.all([
      this.deploymentRepo.getConfig(deployment.id),
      this.appRepo.getById(deployment.appId),
    ]);

    const org = await this.orgRepo.getById(app.orgId);

    const { CoreV1Api: api } =
      await this.kubernetesClientService.getClientsForRequest(
        userId,
        app.projectId,
        ["CoreV1Api"],
      );

    let repositoryURL: string | null = null;
    let pods: V1PodList | null = null;
    if (config.source === "GIT") {
      const gitProvider = await this.gitProviderFactoryService.getGitProvider(
        org.id,
      );
      const repo = await gitProvider?.getRepoById(config.repositoryId);
      repositoryURL = repo?.htmlURL;
    }
    if (config.appType === "workload") {
      pods = await api
        .listNamespacedPod({
          namespace: app.namespace,
          labelSelector: `anvilops.rcac.purdue.edu/deployment-id=${deployment.id}`,
        })
        .catch(() => ({ apiVersion: "v1", items: [] as V1Pod[] }));
    }

    let scheduled = 0,
      ready = 0,
      failed = 0;

    for (const pod of pods?.items ?? []) {
      if (
        pod?.status?.conditions?.find((it) => it.type === "PodScheduled")
          ?.status === "True"
      ) {
        scheduled++;
      }
      if (
        pod?.status?.conditions?.find((it) => it.type === "Ready")?.status ===
        "True"
      ) {
        ready++;
      }
      if (
        pod?.status?.phase === "Failed" ||
        pod?.status?.containerStatuses?.[0]?.state?.terminated
      ) {
        failed++;
      }
    }

    const status =
      deployment.status === "COMPLETE" &&
      config.appType === "workload" &&
      scheduled + ready + failed === 0
        ? ("STOPPED" as const)
        : deployment.status;

    let title: string;
    switch (config.source) {
      case "GIT":
        title = deployment.commitMessage;
        break;
      case "IMAGE":
        title = config.imageTag;
        break;
      case "HELM":
        title = config.url;
        break;
      default:
        title = "Unknown";
        break;
    }

    const podStatus =
      config.appType === "workload"
        ? {
            scheduled,
            ready,
            total: pods.items.length,
            failed,
          }
        : null;

    return {
      repositoryURL,
      title,
      commitHash: config.source === "GIT" ? config.commitHash : null,
      commitMessage: config.source === "GIT" ? deployment.commitMessage : null,
      createdAt: deployment.createdAt.toISOString(),
      updatedAt: deployment.updatedAt.toISOString(),
      id: deployment.id,
      appId: deployment.appId,
      status,
      podStatus,
      config: this.deploymentConfigService.formatDeploymentConfig(config),
    };
  }
}
