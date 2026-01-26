import { SpanStatusCode, trace } from "@opentelemetry/api";
import { db, NotFoundError } from "../db/index.ts";
import type { components } from "../generated/openapi.ts";
import { type LogStream, type LogType } from "../generated/prisma/enums.ts";
import { logger } from "../index.ts";
import { env } from "../lib/env.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import {
  AppNotFoundError,
  UnknownWebhookRequestTypeError,
  UserNotFoundError,
  ValidationError,
} from "./common/errors.ts";
import { deploymentConfigService, deploymentService } from "./helper/index.ts";

export async function processGitHubWebhookPayload(
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
                return await handleRepositoryTransferred(
                  requestBody as components["schemas"]["webhook-repository-transferred"],
                );
              }
              case "deleted": {
                return await handleRepositoryDeleted(
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
                return await handleInstallationCreated(
                  requestBody as components["schemas"]["webhook-installation-created"],
                );
              }
              case "deleted": {
                return await handleInstallationDeleted(
                  requestBody as components["schemas"]["webhook-installation-deleted"],
                );
              }
              default: {
                throw new UnknownWebhookRequestTypeError();
              }
            }
          }
          case "push": {
            return await handlePush(
              requestBody as components["schemas"]["webhook-push"],
            );
          }
          case "workflow_run": {
            return await handleWorkflowRun(
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
async function handleRepositoryTransferred(
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

async function handleRepositoryDeleted(
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
  await db.deployment.unlinkRepositoryFromAllDeployments(payload.repository.id);
}

async function handleInstallationCreated(
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
    await db.user.createUnassignedInstallation(
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

async function handleInstallationDeleted(
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
  await db.org.unlinkInstallationFromAllOrgs(payload.installation.id);
}

/**
 *
 * @throws {Error} if the current config of an app is not a GitConfig
 * @throws {AppNotFoundError} if no apps redeploy on push to this branch
 */
async function handlePush(payload: components["schemas"]["webhook-push"]) {
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

  const updatedBranch = payload.ref.match(/^refs\/heads\/(?<branch>.+)/).groups
    .branch;

  // Look up the connected app and create a deployment job
  const apps = await db.app.listFromConnectedRepo(
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
      const org = await db.org.getById(app.orgId);
      const oldConfig = (
        await db.app.getDeploymentConfig(app.id)
      ).asGitConfig();
      const config = deploymentConfigService.populateNewCommit(
        oldConfig,
        app,
        payload.head_commit.id,
      );
      await deploymentService.create({
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
async function handleWorkflowRun(
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
  const apps = await db.app.listFromConnectedRepo(
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
        const org = await db.org.getById(app.orgId);
        const oldConfig = (
          await db.app.getDeploymentConfig(app.id)
        ).asGitConfig();
        const config = deploymentConfigService.populateNewCommit(
          oldConfig,
          app,
          payload.workflow_run.head_commit.id,
        );
        await deploymentService.create({
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
        const org = await db.org.getById(app.orgId);
        const deployment = await db.deployment.getFromWorkflowRunId(
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
              deployment.id,
              "BUILD",
              "Updated GitHub check run to Completed with conclusion Cancelled",
            );
            await db.deployment.setStatus(deployment.id, "CANCELLED");
          } catch (e) {
            logger.error(e, "Error updating check status and logging failure");
          }
          return;
        }

        const config = (
          await db.deployment.getConfig(deployment.id)
        ).asGitConfig();

        await deploymentService.completeGitDeployment({
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

export function log(
  deploymentId: number,
  type: LogType,
  content: string,
  stream: LogStream = "stdout",
) {
  db.deployment
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
