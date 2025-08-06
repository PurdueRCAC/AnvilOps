import type { components } from "../../generated/openapi.ts";
import { DeploymentSource } from "../../generated/prisma/enums.ts";
import { db } from "../../lib/db.ts";
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
    return json(400, res, { message: "Repository ID not specified" });
  }

  if (payload.action === "in_progress") {
    return json(200, res, {});
  }

  // Look up the connected apps
  const apps = await db.app.findMany({
    where: {
      config: {
        source: DeploymentSource.GIT,
        repositoryId: repoId,
        branch: payload.workflow_run.head_branch,
        event: "workflow_run",
        eventId: payload.workflow.id,
      },
      org: { githubInstallationId: { not: null } },
      enableCD: true,
    },
    include: {
      org: { select: { githubInstallationId: true } },
      config: true,
    },
  });

  if (apps.length === 0) {
    return json(200, res, { message: "No matching apps found" });
  }

  if (payload.action === "requested") {
    for (const app of apps) {
      const octokit = await getOctokit(app.org.githubInstallationId);
      try {
        await createPendingWorkflowDeployment({
          orgId: app.orgId,
          appId: app.id,
          imageRepo: app.imageRepo,
          commitSha: payload.workflow_run.head_commit.id,
          commitMessage: payload.workflow_run.head_commit.message,
          config: {
            // Reuse the config from the previous deployment
            fieldValues: app.config.fieldValues,
            source: "GIT",
            env: app.config.getPlaintextEnv(),
            repositoryId: app.config.repositoryId,
            branch: app.config.branch,
            builder: app.config.builder,
            rootDir: app.config.rootDir,
            dockerfilePath: app.config.dockerfilePath,
            imageTag: app.config.imageTag,
          },
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
      const deployment = await db.deployment.findUnique({
        where: { appId: app.id, workflowRunId: payload.workflow_run.id },
        select: {
          id: true,
          commitHash: true,
          commitMessage: true,
          status: true,
          secret: true,
          checkRunId: true,
          appId: true,
          app: { include: { org: true, appGroup: true } },
          config: true,
        },
      });
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
        const octokit = await getOctokit(app.org.githubInstallationId);
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
          await db.deployment.update({
            where: { id: deployment.id },
            data: { status: "STOPPED" },
          });
        } catch (e) {}
        continue;
      }

      const octokit = await getOctokit(app.org.githubInstallationId);
      await buildAndDeployFromRepo({
        deployment,
        opts: {
          createCheckRun: true,
          octokit,
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
        },
      });
    }
  }
  return json(200, res, {});
};
