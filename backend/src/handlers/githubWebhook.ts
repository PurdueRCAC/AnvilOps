import { Webhooks } from "@octokit/webhooks";
import { randomBytes } from "node:crypto";
import type { Octokit } from "octokit";
import type { components } from "../generated/openapi.ts";
import type { App, Deployment } from "../generated/prisma/client.ts";
import {
  DeploymentSource,
  DeploymentStatus,
  type LogType,
} from "../generated/prisma/enums.ts";
import type { DeploymentConfigCreateWithoutDeploymentInput } from "../generated/prisma/models.ts";
import {
  cancelBuildJobsForApp,
  createBuildJob,
  type CreateJobFromDeploymentInput,
  type ImageTag,
} from "../lib/builder.ts";
import {
  createOrUpdateApp,
  getClientForClusterUsername,
} from "../lib/cluster/kubernetes.ts";
import { shouldImpersonate } from "../lib/cluster/rancher.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { db } from "../lib/db.ts";
import { env } from "../lib/env.ts";
import {
  getInstallationAccessToken,
  getOctokit,
  getRepoById,
} from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import { notifyLogStream } from "./ingestLogs.ts";
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
          await db.deploymentConfig.updateMany({
            where: { repositoryId: payload.repository.id },
            data: { repositoryId: null, branch: null, source: "IMAGE" },
          });
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

          // Make sure the installation wasn't already added to an AnvilOps organization
          const count = await db.organization.count({
            where: { githubInstallationId: payload.installation.id },
          });
          if (count > 0) {
            return json(200, res, {
              message: "Installation is already linked to organization",
            });
          }

          // Find the person who requested the app installation and add a record linked to their account that allows them to link the installation to an organization of their choosing
          const user = await db.user.findFirst({
            where: { githubUserId: payload.sender.id },
          });
          if (user === null) {
            return json(200, res, {
              message:
                "No AnvilOps user found that matches the installation request's sender",
            });
          }

          if (payload.installation.app_id.toString() !== env.GITHUB_APP_ID) {
            // Sanity check
            return json(422, res, { message: "Unknown app ID" });
          }

          await db.unassignedInstallation.create({
            data: {
              installationId: payload.installation.id,
              userId: user.id,
              targetName:
                payload.installation.account["login"] ??
                payload.installation.account.name,
              url: payload.installation.html_url,
            },
          });

          return json(200, res, {
            message: "Unassigned installation created successfully",
          });
        }
        case "deleted": {
          const payload = ctx.request
            .requestBody as components["schemas"]["webhook-installation-deleted"];
          // Unlink the GitHub App installation from the organization
          await db.organization.updateMany({
            where: { githubInstallationId: payload.installation.id },
            data: { githubInstallationId: null },
          });
          await db.organization.updateMany({
            where: { newInstallationId: payload.installation.id },
            data: { newInstallationId: null },
          });
          await db.unassignedInstallation.deleteMany({
            where: { installationId: payload.installation.id },
          });
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
  orgId: number;
  appId: number;
  imageRepo: string;
  commitSha: string;
  commitMessage: string;
  config: DeploymentConfigCreateWithoutDeploymentInput;
} & (
  | { createCheckRun: true; octokit: Octokit; owner: string; repo: string }
  | { createCheckRun: false }
);

export async function buildAndDeploy({
  orgId,
  appId,
  imageRepo,
  commitSha,
  commitMessage,
  config,
  ...opts
}: BuildAndDeployOptions) {
  const imageTag =
    config.source === DeploymentSource.IMAGE
      ? (config.imageTag as ImageTag)
      : (`${env.REGISTRY_HOSTNAME}/${env.HARBOR_PROJECT_NAME}/${imageRepo}:${commitSha}` as const);
  const secret = randomBytes(32).toString("hex");

  const deployment = await db.deployment.create({
    data: {
      app: { connect: { id: appId } },
      commitHash: commitSha,
      commitMessage: commitMessage,
      secret: secret,
      config: {
        create: { ...config, imageTag },
      },
    },
    select: {
      id: true,
      appId: true,
      commitHash: true,
      commitMessage: true,
      secret: true,
      checkRunId: true,
      config: true,
      app: {
        include: {
          appGroup: true,
          org: { select: { githubInstallationId: true } },
        },
      },
    },
  });

  await cancelAllOtherDeployments(deployment.id, deployment.app);

  if (config.source === "GIT") {
    buildAndDeployFromRepo({ deployment, opts });
  } else if (config.source === "IMAGE") {
    log(deployment.id, "BUILD", "Deploying directly from OCI image...");
    // If we're creating a deployment directly from an existing image tag, just deploy it now
    try {
      const { namespace, configs, postCreate } =
        await createAppConfigsFromDeployment(deployment);
      const api = getClientForClusterUsername(
        deployment.app.clusterUsername,
        "KubernetesObjectApi",
        shouldImpersonate(deployment.app.projectId),
      );
      await createOrUpdateApp(
        api,
        deployment.app.name,
        namespace,
        configs,
        postCreate,
      );
      log(deployment.id, "BUILD", "Deployment succeeded");
      await db.deployment.update({
        where: { id: deployment.id },
        data: { status: DeploymentStatus.COMPLETE },
      });
    } catch (e) {
      console.error("Failed to create Kubernetes resources for app", e);
      await db.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.ERROR,
          logs: {
            create: {
              timestamp: new Date(),
              content: {
                log: `Failed to apply Kubernetes resources: ${JSON.stringify(e?.body ?? e)}`,
              },
              type: "BUILD",
            },
          },
        },
      });
      await notifyLogStream(deployment.id);
    }
  }
}

type BuildFromRepoOptions = {
  deployment: CreateJobFromDeploymentInput & Pick<Deployment, "checkRunId">;
  opts:
    | { createCheckRun: true; octokit: Octokit; owner: string; repo: string }
    | { createCheckRun: false };
};
export async function buildAndDeployFromRepo({
  deployment,
  opts,
}: BuildFromRepoOptions) {
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
          head_sha: deployment.commitHash,
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
    jobId = await createBuildJob(deployment);
    log(deployment.id, "BUILD", "Created build job with ID " + jobId);
  } catch (e) {
    log(
      deployment.id,
      "BUILD",
      "Error creating build job: " + JSON.stringify(e),
    );
    await db.deployment.update({
      where: { id: deployment.id },
      data: { status: "ERROR" },
    });
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

  await db.deployment.update({
    where: { id: deployment.id },
    data: { builderJobId: jobId, checkRunId: checkRun?.data?.id },
  });
}

export async function createPendingWorkflowDeployment({
  orgId,
  appId,
  imageRepo,
  commitSha,
  commitMessage,
  config,
  workflowRunId,
  ...opts
}: BuildAndDeployOptions & { workflowRunId: number }) {
  const imageTag =
    config.source === DeploymentSource.IMAGE
      ? (config.imageTag as ImageTag)
      : (`${env.REGISTRY_HOSTNAME}/${env.HARBOR_PROJECT_NAME}/${imageRepo}:${commitSha}` as const);

  const deployment = await db.deployment.create({
    data: {
      app: { connect: { id: appId } },
      commitHash: commitSha,
      commitMessage: commitMessage,
      config: {
        create: { ...config, imageTag },
      },
      workflowRunId,
    },
    select: {
      id: true,
      appId: true,
      secret: true,
      commitHash: true,
      config: true,
      app: {
        include: {
          appGroup: true,
          org: { select: { githubInstallationId: true } },
        },
      },
    },
  });

  await cancelAllOtherDeployments(deployment.id, deployment.app);

  let checkRun:
    | Awaited<ReturnType<Octokit["rest"]["checks"]["create"]>>
    | undefined;
  if (opts.createCheckRun) {
    try {
      checkRun = await opts.octokit.rest.checks.create({
        head_sha: deployment.commitHash,
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
    await db.deployment.update({
      where: { id: deployment.id },
      data: { checkRunId: checkRun.data.id },
    });
  }
}

export async function cancelAllOtherDeployments(
  deploymentId: number,
  app: App & { org: { githubInstallationId?: number } },
  cancelComplete = false,
) {
  await cancelBuildJobsForApp(app.id);

  const deployments = await db.deployment.findMany({
    where: {
      id: { not: deploymentId },
      appId: app.id,
      status: {
        notIn: cancelComplete ? ["ERROR"] : ["COMPLETE", "ERROR"],
      },
    },
    include: {
      config: true,
    },
  });

  const octokit = await getOctokit(app.org.githubInstallationId);
  for (const deployment of deployments) {
    if (
      !["STOPPED", "COMPLETE", "ERROR"].includes(deployment.status) &&
      deployment.checkRunId
    ) {
      // Should have a check run that is either queued or in_progress
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

  await db.deployment.updateMany({
    where: {
      id: { in: deployments.map((deploy) => deploy.id) },
    },
    data: { status: "STOPPED" },
  });
}

export async function log(
  deploymentId: number,
  type: LogType,
  content: string,
) {
  try {
    await db.log.create({
      data: {
        deploymentId,
        type,
        content: { log: content },
        timestamp: new Date(),
      },
    });
    await notifyLogStream(deploymentId);
  } catch {
    // Don't let errors bubble up and disrupt the deployment process
  }
}
