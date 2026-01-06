import { Octokit } from "octokit";
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
import { upgrade } from "../../lib/helm.ts";
import { getOctokit, getRepoById } from "../../lib/octokit.ts";
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
  private getOctokitFn: typeof getOctokit;
  private getRepoByIdFn: typeof getRepoById;
  constructor(
    appRepo: AppRepo,
    appGroupRepo: AppGroupRepo,
    deploymentRepo: DeploymentRepo,
    getOctokitFn?: typeof getOctokit,
    getRepoByIdFn?: typeof getRepoById,
  ) {
    this.appRepo = appRepo;
    this.appGroupRepo = appGroupRepo;
    this.deploymentRepo = deploymentRepo;
    this.getOctokitFn = getOctokitFn ?? getOctokit;
    this.getRepoByIdFn = getRepoByIdFn ?? getRepoById;
  }

  /**
   *
   * @throws DeploymentError
   * Creates a Deployment object and triggers the deployment process.
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
      appType: configIn.appType,
      config: configIn,
    });
    const config = await this.deploymentRepo.getConfig(deployment.id);

    if (!app.configId) {
      await this.appRepo.setConfig(app.id, deployment.configId);
    }

    switch (config.source) {
      case "HELM": {
        this.deployHelm(org, app, deployment, config.asHelmConfig());
        break;
      }

      case "GIT": {
        this.deployGit({
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
        this.deployWorkloadWithoutBuild({
          org,
          app,
          appGroup,
          deployment,
          config,
        });
        break;
      }
    }
  }

  /**
   *
   * @throws DeploymentError
   * Proceeds with a Git deployment from an existing Deployment and GitConfig.
   *  If the skipBuild flag is set, immediately deploy the app.
   *  If the pending flag is set, add a pending check run.
   *  Otherwise, build and deploy.
   */
  private async deployGit({
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
      const { pending, owner, repo } = opts.checkRun;
      if (pending) {
        try {
          const checkRun = await this.handleCheckRun({
            octokit: await this.getOctokitFn(org.githubInstallationId),
            deployment,
            config,
            checkRun: {
              type: "create",
              opts: {
                owner: opts.checkRun.owner,
                repo: opts.checkRun.repo,
                status: "queued",
              },
            },
          });
          log(
            deployment.id,
            "BUILD",
            "Created GitHub check run with status Queued at " +
              checkRun.data.html_url,
          );
          await this.deploymentRepo.setCheckRunId(
            deployment.id,
            checkRun?.data?.id,
          );
          await this.cancelAllOtherDeployments(org, app, deployment.id, false);
        } catch (e) {
          console.error("Failed to set check run: ", e);
        }
      } else {
        await this.completeGitDeployment({
          org,
          app,
          deployment,
          config,
          checkRunOpts: {
            type: "create",
            owner,
            repo,
          },
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
      await this.completeGitDeployment({ org, app, deployment, config });
    }
  }

  /**
   *
   * @throws DeploymentError
   * Builds and deploys from an existing Deployment and GitConfig.
   */
  async completeGitDeployment({
    org,
    app,
    deployment,
    config,
    checkRunOpts,
  }: {
    org: Organization;
    app: App;
    deployment: Deployment;
    config: GitConfig;
    checkRunOpts?: {
      type: "create" | "update";
      owner: string;
      repo: string;
      status?: "in_progress" | "completed" | "queued";
    };
  }) {
    await this.cancelAllOtherDeployments(org, app, deployment.id, true);

    let jobId: string | undefined;
    let octokit: Octokit;
    let checkRun:
      | Awaited<ReturnType<Octokit["rest"]["checks"]["create"]>>
      | Awaited<ReturnType<Octokit["rest"]["checks"]["update"]>>;
    if (checkRunOpts) {
      octokit = await this.getOctokitFn(org.githubInstallationId);
      const { owner, repo, status } = checkRunOpts;
      try {
        switch (checkRunOpts.type) {
          case "create": {
            checkRun = await this.handleCheckRun({
              octokit,
              deployment,
              config,
              checkRun: {
                type: "create",
                opts: { owner, repo, status: status ?? "in_progress" },
              },
            });
            log(
              deployment.id,
              "BUILD",
              "Created GitHub check run with status In Progress at " +
                checkRun.data.html_url,
            );
            break;
          }

          case "update": {
            checkRun = await this.handleCheckRun({
              octokit,
              deployment,
              config,
              checkRun: {
                type: "update",
                opts: {
                  owner,
                  repo,
                  status: status ?? "in_progress",
                  check_run_id: deployment.checkRunId,
                },
              },
            });
            log(
              deployment.id,
              "BUILD",
              "Updated GitHub check run to In Progress at " +
                checkRun.data.html_url,
            );
            break;
          }
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
      if (checkRunOpts && checkRun?.data?.id) {
        // If a check run was created, make sure it's marked as failed
        try {
          await this.handleCheckRun({
            octokit,
            deployment,
            config,
            checkRun: {
              type: "update",
              opts: {
                check_run_id: checkRun.data.id,
                owner: checkRunOpts.owner,
                repo: checkRunOpts.repo,
                status: "completed",
                conclusion: "failure",
              },
            },
          });
          log(
            deployment.id,
            "BUILD",
            "Updated GitHub check run to Completed with conclusion Failure",
          );
        } catch {}
      }
      throw new DeploymentError(e);
    }

    if (checkRun?.data?.id) {
      await this.deploymentRepo.setCheckRunId(deployment.id, checkRun.data.id);
    }
  }

  /**
   *
   * @throws DeploymentError
   * Immediately deploys a workload. The image tag must be set on the config object.
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
        await createAppConfigsFromDeployment(
          org,
          app,
          appGroup,
          deployment,
          config,
        );
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
   *
   * @throws DeploymentError
   * Deploys a helm chart.
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
      await upgrade({
        urlType: config.urlType,
        chartURL: config.url,
        version: config.version,
        namespace: app.namespace,
        release: app.name,
        values: config.values,
      });
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

  private async handleCheckRun({
    octokit,
    deployment,
    config,
    checkRun,
  }: {
    octokit: Octokit;
    deployment: Omit<Deployment, "secret">;
    config: GitConfig;
    checkRun:
      | {
          type: "create";
          opts: {
            owner: string;
            repo: string;
            status: "in_progress" | "completed" | "queued";
          };
        }
      | {
          type: "update";
          opts: {
            owner: string;
            repo: string;
            check_run_id: number;
            status: "in_progress" | "completed" | "queued";
            conclusion?: "cancelled" | "failure" | "success";
          };
        };
  }) {
    switch (checkRun.type) {
      case "create": {
        return await octokit.rest.checks.create({
          ...checkRun.opts,
          head_sha: config.commitHash,
          name: "AnvilOps",
          details_url: `${env.BASE_URL}/app/${deployment.appId}/deployment/${deployment.id}`,
        });
        break;
      }
      case "update": {
        return await octokit.rest.checks.update(checkRun.opts);
        break;
      }
    }
  }

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

    let octokit: Octokit;
    for (const deployment of deployments) {
      if (deployment.id !== deploymentId && !!deployment.checkRunId) {
        // Should have a check run that is either queued or in_progress
        if (!octokit) {
          octokit = await this.getOctokitFn(org.githubInstallationId);
        }
        const config = deployment.config.asGitConfig();

        const repo = await this.getRepoByIdFn(octokit, config.repositoryId);
        try {
          await this.handleCheckRun({
            octokit,
            deployment,
            config,
            checkRun: {
              type: "update",
              opts: {
                check_run_id: deployment.checkRunId,
                owner: repo.owner.login,
                repo: repo.name,
                status: "completed",
                conclusion: "cancelled",
              },
            },
          });
          log(
            deployment.id,
            "BUILD",
            "Updated GitHub check run to Completed with conclusion Cancelled",
          );
        } catch (e) {}
      }
    }
  }
}
