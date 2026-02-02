import { SpanStatusCode, trace } from "@opentelemetry/api";
import { NotFoundError } from "../db/errors/index.ts";
import type { AppRepo } from "../db/repo/app.ts";
import type { DeploymentRepo } from "../db/repo/deployment.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { UserRepo } from "../db/repo/user.ts";
import type { components } from "../generated/openapi.ts";
import { type LogStream, type LogType } from "../generated/prisma/enums.ts";
import { env } from "../lib/env.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { logger } from "../logger.ts";
import type { DeploymentService } from "./common/deployment.ts";
import type { DeploymentConfigService } from "./common/deploymentConfig.ts";
import {
  AppNotFoundError,
  UnknownWebhookRequestTypeError,
  UserNotFoundError,
  ValidationError,
} from "./errors/index.ts";

export class GitHubWebhookService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private userRepo: UserRepo;
  private deploymentRepo: DeploymentRepo;
  private deploymentService: DeploymentService;
  private deploymentConfigService: DeploymentConfigService;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    userRepo: UserRepo,
    deploymentRepo: DeploymentRepo,
    deploymentService: DeploymentService,
    deploymentConfigService: DeploymentConfigService,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.userRepo = userRepo;
    this.deploymentRepo = deploymentRepo;
    this.deploymentService = deploymentService;
    this.deploymentConfigService = deploymentConfigService;
  }

  async processGitHubWebhookPayload(
    event: string,
    action: string,
    requestBody: unknown,
  ) {
    return await trace
      .getTracer("github_webhook")
      .startActiveSpan("process_webhook", async (span) => {
        try {
          switch (event) {
            case "repository": {
              switch (action) {
                case "transferred": {
                  return await this.handleRepositoryTransferred(
                    requestBody as components["schemas"]["webhook-repository-transferred"],
                  );
                }
                case "deleted": {
                  return await this.handleRepositoryDeleted(
                    requestBody as components["schemas"]["webhook-repository-deleted"],
                  );
                }
                default: {
                  throw new UnknownWebhookRequestTypeError();
                }
              }
            }
            case "installation": {
              switch (action) {
                case "created": {
                  return await this.handleInstallationCreated(
                    requestBody as components["schemas"]["webhook-installation-created"],
                  );
                }
                case "deleted": {
                  return await this.handleInstallationDeleted(
                    requestBody as components["schemas"]["webhook-installation-deleted"],
                  );
                }
                default: {
                  throw new UnknownWebhookRequestTypeError();
                }
              }
            }
            case "push": {
              return await this.handlePush(
                requestBody as components["schemas"]["webhook-push"],
              );
            }
            case "workflow_run": {
              return await this.handleWorkflowRun(
                requestBody as components["schemas"]["webhook-workflow-run"],
              );
            }
            default: {
              throw new UnknownWebhookRequestTypeError();
            }
          }
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: "Uncaught error processing GitHub webhook",
          });
        } finally {
          span.end();
        }
      });
  }

  // eslint-disable-next-line require-await, @typescript-eslint/require-await -- TODO
  async handleRepositoryTransferred(
    payload: components["schemas"]["webhook-repository-transferred"],
  ) {
    logger.info(
      {
        changes: payload.changes,
        repoId: payload.repository.id,
        senderId: payload.sender.id,
        senderLogin: payload.sender.login,
      },
      "Received GitHub webhook: repository transferred",
    );
    // TODO Verify that the AnvilOps organization(s) linked to this repo still have access to it
  }

  async handleRepositoryDeleted(
    payload: components["schemas"]["webhook-repository-deleted"],
  ) {
    logger.info(
      {
        repoId: payload.repository.id,
        senderId: payload.sender.id,
        senderLogin: payload.sender.login,
      },
      "Received GitHub webhook: repository deleted",
    );
    // Unlink the repository from all of its associated apps
    // Every deployment from that repository will now be listed as directly from the produced container image
    await this.deploymentRepo.unlinkRepositoryFromAllDeployments(
      payload.repository.id,
    );
  }

  async handleInstallationCreated(
    payload: components["schemas"]["webhook-installation-created"],
  ) {
    logger.info(
      {
        installationId: payload.installation.id,
        senderId: payload.sender.id,
        senderLogin: payload.sender.login,
        requesterId: payload.requester.id,
        requesterLogin: payload.requester.login,
      },
      "Received GitHub webhook: installation created",
    );
    // This webhook is sent when the GitHub App is installed or a request to install the GitHub App is approved. Here, we care about the latter.
    if (!payload.requester) {
      // Since this installation has no requester, it was created without going to an organization admin for approval. That means it's already been linked to an AnvilOps organization in src/handlers/githubOAuthCallback.ts.
      // TODO: Verify that the requester field is what I think it is. GitHub doesn't provide any description of it in their API docs.
      logger.info(
        "Installation has no requester; must have already been linked to an organization",
      );
      return;
    }

    if (payload.installation.app_id.toString() !== env.GITHUB_APP_ID) {
      // Sanity check
      throw new ValidationError("Invalid GitHub app ID");
    }

    // Find the person who requested the app installation and add a record linked to their account that allows them to link the installation to an organization of their choosing
    try {
      logger.info(
        {
          githubUserId: payload.requester.id,
          installationId: payload.installation.id,
        },
        "Creating unassigned installation",
      );
      await this.userRepo.createUnassignedInstallation(
        payload.requester.id,
        payload.installation.id,
        "login" in payload.installation.account
          ? payload.installation.account.login
          : payload.installation.account.name,
        payload.installation.html_url,
      );
    } catch (e) {
      if (e instanceof NotFoundError && e.message === "user") {
        throw new UserNotFoundError(null, { cause: e });
      } else {
        throw e;
      }
    }
  }

  async handleInstallationDeleted(
    payload: components["schemas"]["webhook-installation-deleted"],
  ) {
    logger.info(
      {
        installationId: payload.installation.id,
        senderId: payload.sender.id,
        senderLogin: payload.sender.login,
      },
      "Received GitHub webhook: installation deleted",
    );
    // Unlink the GitHub App installation from the organization
    await this.orgRepo.unlinkInstallationFromAllOrgs(payload.installation.id);
  }

  /**
   *
   * @throws {Error} if the current config of an app is not a GitConfig
   * @throws {AppNotFoundError} if no apps redeploy on push to this branch
   */
  async handlePush(payload: components["schemas"]["webhook-push"]) {
    logger.info(
      {
        installationId: payload.installation.id,
        senderId: payload.sender.id,
        senderLogin: payload.sender.login,
        repoId: payload.repository?.id,
        headCommitSha: payload.head_commit.id,
        ref: payload.ref,
      },
      "Received GitHub webhook: push",
    );

    const repoId = payload.repository?.id;
    if (!repoId) {
      throw new ValidationError("Repository ID not specified");
    }

    const updatedBranch = payload.ref.match(/^refs\/heads\/(?<branch>.+)/)
      .groups.branch;

    // Look up the connected app and create a deployment job
    const apps = await this.appRepo.listFromConnectedRepo(
      repoId,
      "push",
      updatedBranch,
      undefined,
    );

    if (apps.length === 0) {
      throw new AppNotFoundError();
    }

    await Promise.all(
      apps.map(async (app) => {
        const org = await this.orgRepo.getById(app.orgId);
        const oldConfig = (
          await this.appRepo.getDeploymentConfig(app.id)
        ).asGitConfig();
        const config = this.deploymentConfigService.populateNewCommit(
          oldConfig,
          app,
          payload.head_commit.id,
        );
        await this.deploymentService.create({
          org,
          app,
          commitMessage: payload.head_commit.message,
          config,
          git: {
            checkRun: {
              pending: false,
              owner: payload.repository.owner.login,
              repo: payload.repository.name,
            },
          },
        });
      }),
    );
  }

  /**
   * @throws {Error} if the current config of an app is not a GitConfig
   * @throws {AppNotFoundError} if no apps are linked to this branch and workflow
   */
  async handleWorkflowRun(
    payload: components["schemas"]["webhook-workflow-run"],
  ) {
    logger.info(
      {
        installationId: payload.installation.id,
        senderId: payload.sender.id,
        senderLogin: payload.sender.login,
        repoId: payload.repository?.id,
        workflow: payload.workflow.name,
        branch: payload.workflow_run.head_branch,
        commit: payload.workflow_run.head_commit.id,
        action: payload.action,
      },
      "Received GitHub webhook: workflow run",
    );
    const repoId = payload.repository?.id;
    if (!repoId) {
      throw new ValidationError("Repository ID not specified");
    }

    if (payload.action === "in_progress") {
      return;
    }

    // Look up the connected apps
    const apps = await this.appRepo.listFromConnectedRepo(
      repoId,
      "workflow_run",
      payload.workflow_run.head_branch,
      payload.workflow.id,
    );

    if (apps.length === 0) {
      throw new AppNotFoundError();
    }

    if (payload.action === "requested") {
      await Promise.all(
        apps.map(async (app) => {
          const org = await this.orgRepo.getById(app.orgId);
          const oldConfig = (
            await this.appRepo.getDeploymentConfig(app.id)
          ).asGitConfig();
          const config = this.deploymentConfigService.populateNewCommit(
            oldConfig,
            app,
            payload.workflow_run.head_commit.id,
          );
          await this.deploymentService.create({
            org,
            app,
            commitMessage: payload.workflow_run.head_commit.message,
            workflowRunId: payload.workflow_run.id,
            config,
            git: {
              checkRun: {
                pending: true,
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
              },
            },
          });
        }),
      );
    } else if (payload.action === "completed") {
      await Promise.all(
        apps.map(async (app) => {
          const org = await this.orgRepo.getById(app.orgId);
          const deployment = await this.deploymentRepo.getFromWorkflowRunId(
            app.id,
            payload.workflow_run.id,
          );

          if (!deployment || deployment.status !== "PENDING") {
            // If the app was deleted, nothing to do
            // If the deployment was canceled, its check run will be updated to canceled
            return;
          }
          if (payload.workflow_run.conclusion !== "success") {
            // No need to build for unsuccessful workflow run
            log(
              this.deploymentRepo,
              deployment.id,
              "BUILD",
              "Workflow run did not complete successfully",
            );
            if (!deployment.checkRunId) {
              return;
            }
            const gitProvider = await getGitProvider(org.id);
            try {
              await gitProvider.updateCheckStatus(
                payload.repository.id,
                deployment.checkRunId,
                "cancelled",
              );
              log(
                this.deploymentRepo,
                deployment.id,
                "BUILD",
                "Updated GitHub check run to Completed with conclusion Cancelled",
              );
              await this.deploymentRepo.setStatus(deployment.id, "CANCELLED");
            } catch (e) {
              logger.error(
                e,
                "Error updating check status and logging failure",
              );
            }
            return;
          }

          const config = (
            await this.deploymentRepo.getConfig(deployment.id)
          ).asGitConfig();

          await this.deploymentService.completeGitDeployment({
            org,
            app,
            deployment,
            config,
            createOrUpdateCheckRun: true,
          });
        }),
      );
    }
  }
}

export function log(
  deploymentRepo: DeploymentRepo,
  deploymentId: number,
  type: LogType,
  content: string,
  stream: LogStream = "stdout",
) {
  deploymentRepo
    .insertLogs([
      {
        deploymentId,
        content,
        type,
        stream,
        podName: undefined,
        timestamp: new Date(),
      },
    ])
    .catch((err) => {
      logger.error(err, "Failed to write deployment log line");
    });
}
