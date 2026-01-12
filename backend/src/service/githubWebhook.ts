import { db, NotFoundError } from "../db/index.ts";
import { DeploymentRepo } from "../db/repo/deployment.ts";
import type { components } from "../generated/openapi.ts";
import { type LogStream, type LogType } from "../generated/prisma/enums.ts";
import { env } from "../lib/env.ts";
import { getOctokit } from "../lib/octokit.ts";
import {
  AppNotFoundError,
  UnknownWebhookRequestTypeError,
  UserNotFoundError,
  ValidationError,
} from "./common/errors.ts";
import { deploymentService } from "./helper/index.ts";

export async function processGitHubWebhookPayload(
  event: string,
  action: string,
  requestBody: any,
) {
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
}

async function handleRepositoryTransferred(
  payload: components["schemas"]["webhook-repository-transferred"],
) {
  // TODO Verify that the AnvilOps organization(s) linked to this repo still have access to it
}

async function handleRepositoryDeleted(
  payload: components["schemas"]["webhook-repository-deleted"],
) {
  // Unlink the repository from all of its associated apps
  // Every deployment from that repository will now be listed as directly from the produced container image
  await db.deployment.unlinkRepositoryFromAllDeployments(payload.repository.id);
}

async function handleInstallationCreated(
  payload: components["schemas"]["webhook-installation-created"],
) {
  // This webhook is sent when the GitHub App is installed or a request to install the GitHub App is approved. Here, we care about the latter.
  if (!payload.requester) {
    // Since this installation has no requester, it was created without going to an organization admin for approval. That means it's already been linked to an AnvilOps organization in src/handlers/githubOAuthCallback.ts.
    // TODO: Verify that the requester field is what I think it is. GitHub doesn't provide any description of it in their API docs.
    return;
  }

  if (payload.installation.app_id.toString() !== env.GITHUB_APP_ID) {
    // Sanity check
    throw new ValidationError("Invalid GitHub app ID");
  }

  // Find the person who requested the app installation and add a record linked to their account that allows them to link the installation to an organization of their choosing
  try {
    await db.user.createUnassignedInstallation(
      payload.requester.id,
      payload.installation.id,
      payload.installation["login"] ?? payload.installation.account.name,
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
  // Unlink the GitHub App installation from the organization
  await db.org.unlinkInstallationFromAllOrgs(payload.installation.id);
}

/**
 *
 * @throws {Error} if the current config of an app is not a GitConfig
 * @throws {AppNotFoundError} if no apps redeploy on push to this branch
 */
async function handlePush(payload: components["schemas"]["webhook-push"]) {
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

  for (const app of apps) {
    const org = await db.org.getById(app.orgId);
    const oldConfig = (await db.app.getDeploymentConfig(app.id)).asGitConfig();
    await deploymentService.create({
      org,
      app,
      commitMessage: payload.head_commit.message,
      config: DeploymentRepo.cloneWorkloadConfig(oldConfig),
      git: {
        checkRun: {
          pending: false,
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
        },
      },
    });
  }
}

/**
 * @throws {Error} if the current config of an app is not a GitConfig
 * @throws {AppNotFoundError} if no apps are linked to this branch and workflow
 */
async function handleWorkflowRun(
  payload: components["schemas"]["webhook-workflow-run"],
) {
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
    for (const app of apps) {
      const org = await db.org.getById(app.orgId);
      const config = (await db.app.getDeploymentConfig(app.id)).asGitConfig();
      await deploymentService.create({
        org,
        app,
        commitMessage: payload.workflow_run.head_commit.message,
        workflowRunId: payload.workflow_run.id,
        config: DeploymentRepo.cloneWorkloadConfig(config),
        git: {
          checkRun: {
            pending: true,
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
          },
        },
      });
    }
  } else if (payload.action === "completed") {
    for (const app of apps) {
      const org = await db.org.getById(app.orgId);
      const deployment = await db.deployment.getFromWorkflowRunId(
        app.id,
        payload.workflow_run.id,
      );
      const config = (
        await db.deployment.getConfig(deployment.id)
      ).asGitConfig();

      if (!deployment || deployment.status !== "PENDING") {
        // If the app was deleted, nothing to do
        // If the deployment was canceled, its check run will be updated to canceled
        continue;
      }
      if (payload.workflow_run.conclusion !== "success") {
        // No need to build for unsuccessful workflow run
        log(
          deployment.id,
          "BUILD",
          "Workflow run did not complete successfully",
        );
        if (!deployment.checkRunId) {
          continue;
        }
        const octokit = await getOctokit(org.githubInstallationId);
        try {
          await octokit.rest.checks.update({
            check_run_id: deployment.checkRunId,
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            status: "completed",
            conclusion: "cancelled",
          });
          log(
            deployment.id,
            "BUILD",
            "Updated GitHub check run to Completed with conclusion Cancelled",
          );
          await db.deployment.setStatus(deployment.id, "CANCELLED");
        } catch (e) {}
        continue;
      }

      await deploymentService.completeGitDeployment({
        org,
        app,
        deployment,
        config,
        checkRunOpts: {
          type: "update",
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
        },
      });
    }
  }
}

export async function log(
  deploymentId: number,
  type: LogType,
  content: string,
  stream: LogStream = "stdout",
) {
  try {
    await db.deployment.insertLogs([
      {
        deploymentId,
        content,
        type,
        stream,
        podName: undefined,
        timestamp: new Date(),
      },
    ]);
  } catch {
    // Don't let errors bubble up and disrupt the deployment process
  }
}
