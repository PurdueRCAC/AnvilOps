import { db } from "../../db/index.ts";
import { GitConfig, WorkloadConfig } from "../../db/models.ts";
import { DeploymentRepo } from "../../db/repo/deployment.ts";
import type { components } from "../../generated/openapi.ts";
import { getOctokit } from "../../lib/octokit.ts";
import { json, type HandlerMap } from "../../types.ts";
import {
  buildAndDeployFromRepo,
  createPendingWorkflowDeployment,
  log,
} from "../githubWebhook.ts";

export const handleWorkflowRun: HandlerMap["githubWebhook"] = async (
  ctx,
  req,
  res,
) => {
  const payload = ctx.request
    .requestBody as components["schemas"]["webhook-workflow-run"];

  const repoId = payload.repository?.id;
  if (!repoId) {
    return json(400, res, {
      code: 400,
      message: "Repository ID not specified",
    });
  }

  if (payload.action === "in_progress") {
    return json(200, res, {});
  }

  // Look up the connected apps
  const apps = await db.app.listFromConnectedRepo(
    repoId,
    "workflow_run",
    payload.workflow_run.head_branch,
    payload.workflow.id,
  );

  if (apps.length === 0) {
    return json(200, res, { message: "No matching apps found" });
  }

  if (payload.action === "requested") {
    for (const app of apps) {
      const org = await db.org.getById(app.orgId);
      const config = (await db.app.getDeploymentConfig(
        app.id,
      )) as WorkloadConfig;
      const octokit = await getOctokit(org.githubInstallationId);
      try {
        await createPendingWorkflowDeployment({
          org: org,
          app: app,
          imageRepo: app.imageRepo,
          commitMessage: payload.workflow_run.head_commit.message,
          config: DeploymentRepo.cloneWorkloadConfig(config),
          workflowRunId: payload.workflow_run.id,
          createCheckRun: true,
          octokit,
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
        });
      } catch (e) {
        console.error(e);
      }
    }
  } else if (payload.action === "completed") {
    for (const app of apps) {
      const org = await db.org.getById(app.orgId);
      const deployment = await db.deployment.getFromWorkflowRunId(
        app.id,
        payload.workflow_run.id,
      );
      const config = (await db.deployment.getConfig(
        deployment.id,
      )) as GitConfig;

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

      const octokit = await getOctokit(org.githubInstallationId);
      await buildAndDeployFromRepo(org, app, deployment, config, {
        createCheckRun: true,
        octokit,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
      });
    }
  }
  return json(200, res, {});
};
