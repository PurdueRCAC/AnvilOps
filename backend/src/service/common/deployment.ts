import type {
  App,
  AppGroup,
  Deployment,
  GitConfig,
  GitConfigCreate,
  HelmConfig,
  HelmConfigCreate,
  Organization,
  WorkloadConfig,
  WorkloadConfigCreate,
} from "../../db/models.ts";
import type { AppRepo } from "../../db/repo/app.ts";
import type { AppGroupRepo } from "../../db/repo/appGroup.ts";
import type { DeploymentRepo } from "../../db/repo/deployment.ts";
import type { DomainRepo } from "../../db/repo/domain.ts";
import type { OrganizationRepo } from "../../db/repo/organization.ts";
import { logger } from "../../logger.ts";
import { DeploymentError } from "../errors/index.ts";
import { log } from "../githubWebhook.ts";
import type { BuilderService } from "./builder.ts";
import type { KubernetesClientService } from "./cluster/kubernetes.ts";
import type { ClusterResourcesService } from "./cluster/resources.ts";
import type {
  CommitStatus,
  GitProvider,
  GitProviderFactoryService,
} from "./git/gitProvider.ts";
import type { HelmService } from "./helm.ts";

type GitOptions =
  | { skipBuild: boolean; checkRun?: undefined }
  | {
      skipBuild?: false;
      checkRun: { pending: boolean; owner: string; repo: string };
    };

export class DeploymentService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private appGroupRepo: AppGroupRepo;
  private deploymentRepo: DeploymentRepo;
  private domainRepo: DomainRepo;
  private helmService: HelmService;
  private gitProviderFactoryService: GitProviderFactoryService;
  private builderService: BuilderService;
  private clusterResourcesService: ClusterResourcesService;
  private kubernetesClientService: KubernetesClientService;
  private baseURL: string;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    appGroupRepo: AppGroupRepo,
    deploymentRepo: DeploymentRepo,
    domainRepo: DomainRepo,
    helmService: HelmService,
    gitProviderFactoryService: GitProviderFactoryService,
    builderService: BuilderService,
    clusterResourcesService: ClusterResourcesService,
    kubernetesClientService: KubernetesClientService,
    baseURL: string,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.appGroupRepo = appGroupRepo;
    this.deploymentRepo = deploymentRepo;
    this.domainRepo = domainRepo;
    this.helmService = helmService;
    this.gitProviderFactoryService = gitProviderFactoryService;
    this.builderService = builderService;
    this.clusterResourcesService = clusterResourcesService;
    this.kubernetesClientService = kubernetesClientService;
    this.baseURL = baseURL;
  }

  /**
   * Creates a Deployment object and triggers the deployment process.
   * @throws DeploymentError
   */
  async create({
    appId,
    commitMessage,
    workflowRunId,
    config: configIn,
    git,
  }: {
    appId: number;
    commitMessage: string;
    workflowRunId?: number;
    config: WorkloadConfigCreate | GitConfigCreate | HelmConfigCreate;
    git?: GitOptions;
  }) {
    const app = await this.appRepo.getById(appId);
    const [org, deployment] = await Promise.all([
      this.orgRepo.getById(app.orgId),
      this.deploymentRepo.create({
        appId: app.id,
        commitMessage,
        workflowRunId,
        config: configIn,
        ...(git?.checkRun?.pending && { status: "PENDING" }),
      }),
    ]);
    const config = await this.deploymentRepo.getConfig(deployment.id);

    if (!app.configId) {
      await this.appRepo.setConfig(app.id, deployment.configId);
    }

    switch (config.source) {
      case "HELM": {
        await this.deployHelm(org, app, deployment, config.asHelmConfig());
        break;
      }

      case "GIT": {
        await this.handleGitDeployment({
          org,
          app,
          deployment,
          config: config.asGitConfig(),
          opts: git,
        });
        break;
      }

      case "IMAGE": {
        const appGroup = await this.appGroupRepo.getById(app.appGroupId);
        await this.deployWorkloadWithoutBuild({
          org,
          app,
          appGroup,
          deployment,
          config,
        });
        break;
      }

      default: {
        config satisfies never; // Make sure switch is exhaustive
      }
    }
  }

  /**
   * Proceeds with a Git deployment from an existing Deployment and GitConfig.
   * - If opts.skipBuild is true, immediately deploy the app.
   * - If opts.checkRun is present, deploy in response to a webhook. When opts.pending is true, create a pending check run and wait for other workflows to complete. When opts.pending is false, start the build.
   * - Otherwise, build and deploy as if a new app has just been created.
   *
   * @throws DeploymentError
   */
  private async handleGitDeployment({
    org,
    app,
    deployment,
    config,
    opts,
  }: {
    org: Organization;
    app: App;
    deployment: Deployment;
    config: GitConfig;
    opts?: GitOptions;
  }) {
    if (opts?.checkRun) {
      // Webhook event deployment
      const { pending } = opts.checkRun;
      if (pending) {
        // AnvilOps is waiting for another CI workflow to finish before deploying the app. Create a "Pending" check run for now.
        // When the other workflow completes, this method will be called again with `pending` set to `false`.
        await this.createPendingCheckRun({
          org,
          app,
          deployment,
          config,
        });
      } else {
        await this.completeGitDeployment({
          org,
          app,
          deployment,
          config,
          createOrUpdateCheckRun: true,
        });
      }
    } else if (opts?.skipBuild) {
      // Minor config update
      const appGroup = await this.appGroupRepo.getById(app.appGroupId);
      await this.deployWorkloadWithoutBuild({
        org,
        app,
        appGroup,
        deployment,
        config,
      });
    } else {
      // Regular app creation
      await this.completeGitDeployment({
        org,
        app,
        deployment,
        config,
        createOrUpdateCheckRun: false,
      });
    }
  }

  /**
   * Creates a pending check run for a Git deployment,
   * to be updated when an associated workflow run completes.
   */
  private async createPendingCheckRun({
    org,
    app,
    deployment,
    config,
  }: {
    org: Organization;
    app: App;
    deployment: Deployment;
    config: GitConfig;
  }) {
    try {
      const checkRunId = await this.createCheckRun(
        await this.gitProviderFactoryService.getGitProvider(org.id),
        deployment,
        config,
        config.repositoryId,
        "queued",
      );
      log(
        this.deploymentRepo,
        deployment.id,
        "BUILD",
        "Created GitHub check run with status Queued",
      );
      await this.deploymentRepo.setCheckRunId(deployment.id, checkRunId);
      await this.cancelAllOtherDeployments(org, app, deployment.id, false);
    } catch (e) {
      logger.error(e, "Failed to create check run");
    }
  }

  /**
   * Builds and deploys from an existing Deployment and GitConfig.
   * @throws DeploymentError
   */
  async completeGitDeployment({
    org,
    app,
    deployment,
    config,
    createOrUpdateCheckRun,
  }: {
    org: Organization;
    app: App;
    deployment: Deployment;
    config: GitConfig;
    createOrUpdateCheckRun: boolean;
  }) {
    await this.cancelAllOtherDeployments(org, app, deployment.id, true);

    let jobId: string | undefined;
    let gitProvider: GitProvider;
    let checkRunId: number | undefined;
    if (createOrUpdateCheckRun) {
      gitProvider = await this.gitProviderFactoryService.getGitProvider(org.id);
      try {
        if (deployment.checkRunId) {
          await this.updateCheckRun(
            gitProvider,
            config.repositoryId,
            deployment.checkRunId,
            "in_progress",
          );
          log(
            this.deploymentRepo,
            deployment.id,
            "BUILD",
            "Updated GitHub check run to In Progress",
          );
        } else {
          checkRunId = await this.createCheckRun(
            gitProvider,
            deployment,
            config,
            config.repositoryId,
            "in_progress",
          );
          log(
            this.deploymentRepo,
            deployment.id,
            "BUILD",
            "Created GitHub check run with status In Progress",
          );
          await this.deploymentRepo.setCheckRunId(deployment.id, checkRunId);
        }
      } catch (e) {
        logger.error(e, "Failed to create or update check run");
      }
    }

    try {
      jobId = await this.builderService.createBuildJob(
        org,
        app,
        deployment,
        config,
      );
      log(
        this.deploymentRepo,
        deployment.id,
        "BUILD",
        "Created build job with ID " + jobId,
      );
    } catch (e) {
      log(
        this.deploymentRepo,
        deployment.id,
        "BUILD",
        "Error creating build job: " + JSON.stringify(e),
        "stderr",
      );
      await this.deploymentRepo.setStatus(deployment.id, "ERROR");
      if (createOrUpdateCheckRun && checkRunId) {
        // If a check run was created, make sure it's marked as failed
        try {
          await this.updateCheckRun(
            gitProvider,
            config.repositoryId,
            checkRunId,
            "failure",
          );
          log(
            this.deploymentRepo,
            deployment.id,
            "BUILD",
            "Updated GitHub check run to Completed with conclusion Failure",
          );
        } catch (e) {
          logger.error(e, "Failed to update check run and write log line");
        }
      }
      throw new DeploymentError(e as Error);
    }
  }

  /**
   * Immediately deploys a workload. The image tag must be set on the config object.
   * @throws DeploymentError
   */
  private async deployWorkloadWithoutBuild({
    org,
    app,
    appGroup,
    deployment,
    config,
  }: {
    org: Organization;
    app: App;
    appGroup: AppGroup;
    deployment: Deployment;
    config: WorkloadConfig;
  }) {
    await this.cancelAllOtherDeployments(org, app, deployment.id, true);
    await this.deploymentRepo.setStatus(deployment.id, "DEPLOYING");
    log(
      this.deploymentRepo,
      deployment.id,
      "BUILD",
      "Deploying directly from OCI image...",
    );
    // If we're creating a deployment directly from an existing image tag, just deploy it now
    await this.finishDeployment(org, app, appGroup, deployment, config);
  }

  /**
   * Generates Kubernetes configs from the AnvilOps deployment object, applies them to the cluster, and updates the deployment's status to Complete.
   */
  async finishDeployment(
    org: Organization,
    app: App,
    appGroup: AppGroup,
    deployment: Deployment,
    config: WorkloadConfig,
  ) {
    try {
      const customDomains = await this.domainRepo.listByAppId(app.id);
      const { namespace, configs, postCreate } =
        await this.clusterResourcesService.createAppConfigsFromDeployment({
          org,
          app,
          appGroup,
          deployment,
          customDomains,
          config,
        });
      await this.kubernetesClientService.createOrUpdateApp(
        app,
        namespace,
        configs,
        postCreate,
      );
      log(this.deploymentRepo, deployment.id, "BUILD", "Deployment succeeded");
      await Promise.all([
        this.deploymentRepo.setStatus(deployment.id, "COMPLETE"),
        this.appRepo.setConfig(app.id, deployment.configId),
      ]);
    } catch (e) {
      await this.deploymentRepo.setStatus(deployment.id, "ERROR");
      log(
        this.deploymentRepo,
        deployment.id,
        "BUILD",
        `Failed to apply Kubernetes resources: ${JSON.stringify(e)}`,
        "stderr",
      );
      throw new DeploymentError(e as Error);
    }
  }

  /**
   * Deploys a helm chart.
   * @throws DeploymentError
   */
  private async deployHelm(
    org: Organization,
    app: App,
    deployment: Deployment,
    config: HelmConfig,
  ) {
    await this.cancelAllOtherDeployments(org, app, deployment.id, true);
    log(
      this.deploymentRepo,
      deployment.id,
      "BUILD",
      "Deploying directly from Helm chart...",
    );
    try {
      await this.helmService.upgrade(app, deployment, config);
      await this.appRepo.setConfig(app.id, deployment.configId);
    } catch (e) {
      await this.deploymentRepo.setStatus(deployment.id, "ERROR");
      log(
        this.deploymentRepo,
        deployment.id,
        "BUILD",
        `Failed to create Helm deployment job: ${JSON.stringify(e)}`,
        "stderr",
      );
      throw new DeploymentError(e as Error);
    }
  }

  private async createCheckRun(
    gitProvider: GitProvider,
    deployment: Omit<Deployment, "secret">,
    config: GitConfig,
    repoId: number,
    status: CommitStatus,
  ) {
    return await gitProvider.createCheckStatus(
      repoId,
      config.commitHash,
      status,
      `${this.baseURL}/app/${deployment.appId}/deployment/${deployment.id}`,
    );
  }

  private async updateCheckRun(
    gitProvider: GitProvider,
    repoId: number,
    checkId: number,
    newStatus: CommitStatus,
  ) {
    await gitProvider.updateCheckStatus(repoId, checkId, newStatus);
  }

  /**
   * @throws {Error} if a deployment has a checkRunId but its config is not a GitConfig
   */
  async cancelAllOtherDeployments(
    org: Organization,
    app: App,
    deploymentId: number,
    cancelComplete = false,
  ) {
    await this.kubernetesClientService.cancelBuildJobsForApp(app.id);

    const deployments = await this.appRepo.getDeploymentsWhereStatusNotIn(
      app.id,
      cancelComplete
        ? ["CANCELLED", "ERROR"]
        : ["CANCELLED", "ERROR", "COMPLETE"],
    );

    let gitProvider: GitProvider;
    await Promise.all(
      deployments.map(async (deployment) => {
        if (deployment.id === deploymentId) {
          return;
        }
        if (deployment.checkRunId) {
          // Should have a check run that is either queued or in_progress
          if (!gitProvider) {
            gitProvider = await this.gitProviderFactoryService.getGitProvider(
              org.id,
            );
          }
          const config = deployment.config.asGitConfig();
          try {
            await this.updateCheckRun(
              gitProvider,
              config.repositoryId,
              deployment.checkRunId,
              "cancelled",
            );
            log(
              this.deploymentRepo,
              deployment.id,
              "BUILD",
              "Updated GitHub check run to Completed with conclusion Cancelled",
            );
          } catch (e) {
            logger.error(e, "Failed to update check run and write log line");
          }
        }
        if (deployment.status != "COMPLETE") {
          await this.deploymentRepo.setStatus(deployment.id, "CANCELLED");
        }
      }),
    );
  }
}
