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
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import {
  AppNotFoundError,
  UnknownWebhookRequestTypeError,
  UserNotFoundError,
  ValidationError,
} from "./common/errors.ts";

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
    const config = await db.app.getDeploymentConfig(app.id);
    const octokit = await getOctokit(org.githubInstallationId);

    await buildAndDeploy({
      org: org,
      app: app,
      imageRepo: app.imageRepo,
      commitMessage: payload.head_commit.message,
      config: {
        // Reuse the config from the previous deployment
        port: config.port,
        replicas: config.replicas,
        requests: config.requests,
        limits: config.limits,
        mounts: config.mounts,
        createIngress: config.createIngress,
        subdomain: config.subdomain,
        collectLogs: config.collectLogs,
        source: "GIT",
        event: config.event,
        env: config.getEnv(),
        repositoryId: config.repositoryId,
        branch: config.branch,
        commitHash: payload.head_commit.id,
        builder: config.builder,
        rootDir: config.rootDir,
        dockerfilePath: config.dockerfilePath,
        imageTag: config.imageTag,
      },
      createCheckRun: true,
      octokit,
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    });
  }
}

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
      const config = await db.app.getDeploymentConfig(app.id);
      const octokit = await getOctokit(org.githubInstallationId);
      try {
        await createPendingWorkflowDeployment({
          org: org,
          app: app,
          imageRepo: app.imageRepo,
          commitMessage: payload.workflow_run.head_commit.message,
          config: {
            // Reuse the config from the previous deployment
            port: config.port,
            replicas: config.replicas,
            requests: config.requests,
            limits: config.limits,
            mounts: config.mounts,
            createIngress: config.createIngress,
            subdomain: config.subdomain,
            collectLogs: config.collectLogs,
            source: "GIT",
            env: config.getEnv(),
            repositoryId: config.repositoryId,
            branch: config.branch,
            commitHash: payload.workflow_run.head_commit.id,
            builder: config.builder,
            rootDir: config.rootDir,
            dockerfilePath: config.dockerfilePath,
            imageTag: config.imageTag,
            event: config.event,
            eventId: config.eventId,
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
      const org = await db.org.getById(app.orgId);
      const deployment = await db.deployment.getFromWorkflowRunId(
        app.id,
        payload.workflow_run.id,
      );
      const config = await db.deployment.getConfig(deployment.id);

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
