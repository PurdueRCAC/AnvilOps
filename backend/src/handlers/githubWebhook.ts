import { Webhooks } from "@octokit/webhooks";
import type { Octokit } from "octokit";
import { db, NotFoundError } from "../db/index.ts";
import type {
  App,
  Deployment,
  DeploymentConfig,
  DeploymentConfigCreate,
  Organization,
} from "../db/models.ts";
import type { components } from "../generated/openapi.ts";
import {
  DeploymentSource,
  DeploymentStatus,
  type LogStream,
  type LogType,
} from "../generated/prisma/enums.ts";
import {
  cancelBuildJobsForApp,
  createBuildJob,
  type ImageTag,
} from "../lib/builder.ts";
import {
  createOrUpdateApp,
  getClientForClusterUsername,
} from "../lib/cluster/kubernetes.ts";
import { shouldImpersonate } from "../lib/cluster/rancher.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { env } from "../lib/env.ts";
import {
  getInstallationAccessToken,
  getOctokit,
  getRepoById,
} from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import { handlePush } from "./webhook/push.ts";
import { handleWorkflowRun } from "./webhook/workflow_run.ts";

const webhooks = new Webhooks({ secret: env.GITHUB_WEBHOOK_SECRET });

export const githubWebhook: HandlerMap["githubWebhook"] = async (
  ctx,
  req,
  res,
  next,
) => {
  const signature = ctx.request.headers["x-hub-signature-256"];
  const data = req.body as string;

  if (!signature) {
    return json(401, res, {});
  }

  const isValid = await webhooks.verify(data, signature);
  if (!isValid) {
    return json(403, res, {});
  }

  const requestType = ctx.request.headers["x-github-event"];
  const action = ctx.request.requestBody["action"];

  switch (requestType) {
    case "repository": {
      switch (action) {
        case "transferred": {
          const payload = ctx.request
            .requestBody as components["schemas"]["webhook-repository-transferred"];
          // TODO
          break;
        }
        case "deleted": {
          const payload = ctx.request
            .requestBody as components["schemas"]["webhook-repository-deleted"];
          // Unlink the repository from all of its associated apps
          // Every deployment from that repository will now be listed as directly from the produced container image
          await db.deployment.unlinkRepositoryFromAllDeployments(
            payload.repository.id,
          );
          return json(200, res, {});
        }
        default: {
          return json(422, res, {});
        }
      }
      break;
    }
    case "installation": {
      switch (action) {
        case "created": {
          const payload = ctx.request
            .requestBody as components["schemas"]["webhook-installation-created"];
          // This webhook is sent when the GitHub App is installed or a request to install the GitHub App is approved. Here, we care about the latter.
          if (!payload.requester) {
            // Since this installation has no requester, it was created without going to an organization admin for approval. That means it's already been linked to an AnvilOps organization in src/handlers/githubOAuthCallback.ts.
            // TODO: Verify that the requester field is what I think it is. GitHub doesn't provide any description of it in their API docs.
            return json(200, res, {});
          }

          if (payload.installation.app_id.toString() !== env.GITHUB_APP_ID) {
            // Sanity check
            return json(422, res, { message: "Unknown app ID" });
          }

          // Find the person who requested the app installation and add a record linked to their account that allows them to link the installation to an organization of their choosing
          try {
            await db.user.createUnassignedInstallation(
              payload.requester.id,
              payload.installation.id,
              payload.installation["login"] ??
                payload.installation.account.name,
              payload.installation.html_url,
            );
          } catch (e) {
            if (e instanceof NotFoundError && e.message === "user") {
              return json(200, res, {
                message:
                  "No AnvilOps user found that matches the installation request's sender",
              });
            } else {
              throw e;
            }
          }

          return json(200, res, {
            message: "Unassigned installation created successfully",
          });
        }
        case "deleted": {
          const payload = ctx.request
            .requestBody as components["schemas"]["webhook-installation-deleted"];
          // Unlink the GitHub App installation from the organization
          await db.org.unlinkInstallationFromAllOrgs(payload.installation.id);
          return json(200, res, {});
        }
        default: {
          return json(422, res, {});
        }
      }
      break;
    }
    case "push": {
      return await handlePush(ctx, req, res, next);
    }
    case "workflow_run": {
      return await handleWorkflowRun(ctx, req, res, next);
    }
    default: {
      return json(422, res, {});
    }
  }

  return json(200, res, {});
};

export async function generateCloneURLWithCredentials(
  octokit: Octokit,
  originalURL: string,
) {
  const url = URL.parse(originalURL);

  if (url.host !== URL.parse(env.GITHUB_BASE_URL).host) {
    // If the target is on a different GitHub instance, don't add credentials!
    return originalURL;
  }

  const token = await getInstallationAccessToken(octokit);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

type BuildAndDeployOptions = {
  org: Organization;
  app: App;
  imageRepo: string;
  commitMessage: string;
  config: DeploymentConfigCreate;
} & (
  | { createCheckRun: true; octokit: Octokit; owner: string; repo: string }
  | { createCheckRun: false }
);

export async function buildAndDeploy({
  org,
  app,
  imageRepo,
  commitMessage,
  config: configIn,
  ...opts
}: BuildAndDeployOptions) {
  const imageTag =
    configIn.source === DeploymentSource.IMAGE
      ? (configIn.imageTag as ImageTag)
      : (`${env.REGISTRY_HOSTNAME}/${env.HARBOR_PROJECT_NAME}/${imageRepo}:${configIn.commitHash}` as const);

  const [deployment, appGroup] = await Promise.all([
    db.deployment.create({
      appId: app.id,
      commitMessage,
      config: { ...configIn, imageTag },
    }),
    db.appGroup.getById(app.appGroupId),
  ]);

  const config = await db.deployment.getConfig(deployment.id);

  if (!app.configId) {
    // Only set the app's config reference if we are creating the app.
    // If updating, first wait for the build to complete successfully
    // and set this in updateDeployment.
    await db.app.setConfig(app.id, deployment.configId);
  }

  await cancelAllOtherDeployments(org, app, deployment.id, true);

  if (config.source === "GIT") {
    buildAndDeployFromRepo(org, app, deployment, config, opts);
  } else if (config.source === "IMAGE") {
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
      await db.deployment.setStatus(deployment.id, DeploymentStatus.COMPLETE);
    } catch (e) {
      console.error(
        `Failed to create Kubernetes resources for deployment ${deployment.id}`,
        e,
      );
      await db.deployment.setStatus(deployment.id, DeploymentStatus.ERROR);
      log(
        deployment.id,
        "BUILD",
        `Failed to apply Kubernetes resources: ${JSON.stringify(e?.body ?? e)}`,
        "stderr",
      );
    }
  }
}

export async function buildAndDeployFromRepo(
  org: Organization,
  app: App,
  deployment: Deployment,
  config: DeploymentConfig,
  opts:
    | { createCheckRun: true; octokit: Octokit; owner: string; repo: string }
    | { createCheckRun: false },
) {
  let checkRun:
    | Awaited<ReturnType<Octokit["rest"]["checks"]["create"]>>
    | Awaited<ReturnType<Octokit["rest"]["checks"]["update"]>>
    | undefined;

  if (opts.createCheckRun) {
    try {
      if (deployment.checkRunId) {
        // We are finishing a deployment that was pending earlier
        checkRun = await opts.octokit.rest.checks.update({
          check_run_id: deployment.checkRunId,
          status: "in_progress",
          owner: opts.owner,
          repo: opts.repo,
        });
        log(
          deployment.id,
          "BUILD",
          "Updated GitHub check run to In Progress at " +
            checkRun.data.html_url,
        );
      } else {
        // Create a check on their commit that says the build is "in progress"
        checkRun = await opts.octokit.rest.checks.create({
          head_sha: config.commitHash,
          name: "AnvilOps",
          status: "in_progress",
          details_url: `${env.BASE_URL}/app/${deployment.appId}/deployment/${deployment.id}`,
          owner: opts.owner,
          repo: opts.repo,
        });
        log(
          deployment.id,
          "BUILD",
          "Created GitHub check run with status In Progress at " +
            checkRun.data.html_url,
        );
      }
    } catch (e) {
      console.error("Failed to modify check run: ", e);
    }
  }

  let jobId: string | undefined;
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
    await db.deployment.setStatus(deployment.id, "ERROR");
    if (opts.createCheckRun && checkRun.data.id) {
      // If a check run was created, make sure it's marked as failed
      try {
        await opts.octokit.rest.checks.update({
          check_run_id: checkRun.data.id,
          owner: opts.owner,
          repo: opts.repo,
          status: "completed",
          conclusion: "failure",
        });
        log(
          deployment.id,
          "BUILD",
          "Updated GitHub check run to Completed with conclusion Failure",
        );
      } catch {}
    }
    throw new Error("Failed to create build job", { cause: e });
  }

  await db.deployment.setCheckRunId(deployment.id, checkRun?.data?.id);
}

export async function createPendingWorkflowDeployment({
  org,
  app,
  imageRepo,
  commitMessage,
  config,
  workflowRunId,
  ...opts
}: BuildAndDeployOptions & { workflowRunId: number }) {
  const imageTag =
    config.source === DeploymentSource.IMAGE
      ? (config.imageTag as ImageTag)
      : (`${env.REGISTRY_HOSTNAME}/${env.HARBOR_PROJECT_NAME}/${imageRepo}:${config.commitHash}` as const);

  const deployment = await db.deployment.create({
    appId: app.id,
    commitMessage,
    workflowRunId,
    config: {
      ...config,
      imageTag,
    },
  });

  await cancelAllOtherDeployments(org, app, deployment.id, false);

  let checkRun:
    | Awaited<ReturnType<Octokit["rest"]["checks"]["create"]>>
    | undefined;
  if (opts.createCheckRun) {
    try {
      checkRun = await opts.octokit.rest.checks.create({
        head_sha: config.commitHash,
        name: "AnvilOps",
        status: "queued",
        details_url: `${env.BASE_URL}/app/${deployment.appId}/deployment/${deployment.id}`,
        owner: opts.owner,
        repo: opts.repo,
      });
      log(
        deployment.id,
        "BUILD",
        "Created GitHub check run with status Queued at " +
          checkRun.data.html_url,
      );
    } catch (e) {
      console.error("Failed to modify check run: ", e);
    }
  }
  if (checkRun) {
    await db.deployment.setCheckRunId(deployment.id, checkRun.data.id);
  }
}

export async function cancelAllOtherDeployments(
  org: Organization,
  app: App,
  deploymentId: number,
  cancelComplete = false,
) {
  await cancelBuildJobsForApp(app.id);

  const statuses = Object.keys(DeploymentStatus) as DeploymentStatus[];
  const deployments = await db.app.getDeploymentsWithStatus(
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
        octokit = await getOctokit(org.githubInstallationId);
      }
      const repo = await getRepoById(octokit, deployment.config.repositoryId);
      await octokit.rest.checks.update({
        check_run_id: deployment.checkRunId,
        owner: repo.owner.login,
        repo: repo.name,
        status: "completed",
        conclusion: "cancelled",
      });
      log(
        deployment.id,
        "BUILD",
        "Updated GitHub check run to Completed with conclusion Cancelled",
      );
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
