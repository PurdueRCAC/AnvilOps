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
import { AppRepo } from "../../db/repo/app.ts";
import { AppGroupRepo } from "../../db/repo/appGroup.ts";
import { DeploymentRepo } from "../../db/repo/deployment.ts";
import { DeploymentStatus } from "../../generated/prisma/enums.ts";
import { cancelBuildJobsForApp, createBuildJob } from "../../lib/builder.ts";
import {
  createOrUpdateApp,
  getClientForClusterUsername,
} from "../../lib/cluster/kubernetes.ts";
import { shouldImpersonate } from "../../lib/cluster/rancher.ts";
import { createAppConfigsFromDeployment } from "../../lib/cluster/resources.ts";
import { env } from "../../lib/env.ts";
import {
  getGitProvider,
  type CommitStatus,
  type GitProvider,
} from "../../lib/git/gitProvider.ts";
import { upgrade } from "../../lib/helm.ts";
import { DeploymentError } from "../common/errors.ts";
import { log } from "../githubWebhook.ts";

type GitOptions =
  | { skipBuild: boolean; checkRun?: undefined }
  | {
      skipBuild?: false;
      checkRun: { pending: boolean; owner: string; repo: string };
    };

export class DeploymentService {
  private appRepo: AppRepo;
  private appGroupRepo: AppGroupRepo;
  private deploymentRepo: DeploymentRepo;
  constructor(
    appRepo: AppRepo,
    appGroupRepo: AppGroupRepo,
    deploymentRepo: DeploymentRepo,
  ) {
    this.appRepo = appRepo;
    this.appGroupRepo = appGroupRepo;
    this.deploymentRepo = deploymentRepo;
  }

  /**
   * Creates a Deployment object and triggers the deployment process.
   * @throws DeploymentError
   */
  async create({
    org,
    app,
    commitMessage,
    workflowRunId,
    config: configIn,
    git,
  }: {
    org: Organization;
    app: App;
    commitMessage: string;
    workflowRunId?: number;
    config: WorkloadConfigCreate | GitConfigCreate | HelmConfigCreate;
    git?: GitOptions;
  }) {
    const deployment = await this.deploymentRepo.create({
      appId: app.id,
      commitMessage,
      workflowRunId,
      config: configIn,
      ...(git?.checkRun?.pending && { status: "PENDING" }),
    });
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
        await getGitProvider(org.id),
        deployment,
        config,
        config.repositoryId,
        "queued",
      );
      log(
        deployment.id,
        "BUILD",
        "Created GitHub check run with status Queued",
      );
      await this.deploymentRepo.setCheckRunId(deployment.id, checkRunId);
      await this.cancelAllOtherDeployments(org, app, deployment.id, false);
    } catch (e) {
      console.error("Failed to set check run: ", e);
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
      gitProvider = await getGitProvider(org.id);
      try {
        if (deployment.checkRunId) {
          await this.updateCheckRun(
            gitProvider,
            config.repositoryId,
            deployment.checkRunId,
            "in_progress",
          );
          log(
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
            deployment.id,
            "BUILD",
            "Created GitHub check run with status In Progress",
          );
          await this.deploymentRepo.setCheckRunId(deployment.id, checkRunId);
        }
      } catch (e) {
        console.error("Failed to set check run: ", e);
      }
    }

    try {
      jobId = await createBuildJob(org, app, deployment, config);
      log(deployment.id, "BUILD", "Created build job with ID " + jobId);
    } catch (e) {
      log(
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
            deployment.id,
            "BUILD",
            "Updated GitHub check run to Completed with conclusion Failure",
          );
        } catch {}
      }
      throw new DeploymentError(e);
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
    await this.deploymentRepo.setStatus(
      deployment.id,
      DeploymentStatus.DEPLOYING,
    );
    log(deployment.id, "BUILD", "Deploying directly from OCI image...");
    // If we're creating a deployment directly from an existing image tag, just deploy it now
    try {
      const { namespace, configs, postCreate } =
        await createAppConfigsFromDeployment({
          org,
          app,
          appGroup,
          deployment,
          config,
        });
      const api = getClientForClusterUsername(
        app.clusterUsername,
        "KubernetesObjectApi",
        shouldImpersonate(app.projectId),
      );
      await createOrUpdateApp(api, app.name, namespace, configs, postCreate);
      log(deployment.id, "BUILD", "Deployment succeeded");
      await this.deploymentRepo.setStatus(
        deployment.id,
        DeploymentStatus.COMPLETE,
      );
      await this.appRepo.setConfig(app.id, deployment.configId);
    } catch (e) {
      await this.deploymentRepo.setStatus(
        deployment.id,
        DeploymentStatus.ERROR,
      );
      log(
        deployment.id,
        "BUILD",
        `Failed to apply Kubernetes resources: ${JSON.stringify(e?.body ?? e)}`,
        "stderr",
      );
      throw new DeploymentError(e);
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
    log(deployment.id, "BUILD", "Deploying directly from Helm chart...");
    try {
      await upgrade(app, deployment, config);
      await this.appRepo.setConfig(app.id, deployment.configId);
    } catch (e) {
      await this.deploymentRepo.setStatus(
        deployment.id,
        DeploymentStatus.ERROR,
      );
      log(
        deployment.id,
        "BUILD",
        `Failed to create Helm deployment job: ${JSON.stringify(e?.body ?? e)}`,
        "stderr",
      );
      throw new DeploymentError(e);
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
      `${env.BASE_URL}/app/${deployment.appId}/deployment/${deployment.id}`,
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
    await cancelBuildJobsForApp(app.id);

    const statuses = Object.keys(DeploymentStatus) as DeploymentStatus[];
    const deployments = await this.appRepo.getDeploymentsWithStatus(
      app.id,
      cancelComplete
        ? statuses.filter((it) => it != "ERROR")
        : statuses.filter((it) => it != "ERROR" && it != "COMPLETE"),
    );

    let gitProvider: GitProvider;
    for (const deployment of deployments) {
      if (deployment.id === deploymentId) {
        continue;
      }
      if (!!deployment.checkRunId) {
        // Should have a check run that is either queued or in_progress
        if (!gitProvider) {
          gitProvider = await getGitProvider(org.id);
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
            deployment.id,
            "BUILD",
            "Updated GitHub check run to Completed with conclusion Cancelled",
          );
        } catch (e) {}
      }
      if (deployment.status != "COMPLETE") {
        await this.deploymentRepo.setStatus(deployment.id, "CANCELLED");
      }
    }
  }
}
