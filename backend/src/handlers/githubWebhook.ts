import { ApiException } from "@kubernetes/client-node";
import { Webhooks } from "@octokit/webhooks";
import { randomBytes } from "node:crypto";
import type { Octokit } from "octokit";
import type { components } from "../generated/openapi.ts";
import {
  DeploymentSource,
  DeploymentStatus,
} from "../generated/prisma/enums.ts";
import type {
  DeploymentConfigCreateWithoutDeploymentInput,
  MountConfigCreateNestedManyWithoutDeploymentConfigInput,
} from "../generated/prisma/models.ts";
import { createBuildJob, type ImageTag } from "../lib/builder.ts";
import { db } from "../lib/db.ts";
import {
  createAppConfigsFromDeployment,
  createNamespaceConfig,
  createOrUpdateApp,
  getNamespace,
} from "../lib/kubernetes.ts";
import { getOctokit } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";

const webhooks = new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET });

export const githubWebhook: HandlerMap["githubWebhook"] = async (
  ctx,
  req,
  res,
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
        }
        case "deleted": {
          const payload = ctx.request
            .requestBody as components["schemas"]["webhook-repository-deleted"];
          // TODO
        }
        default: {
          return json(422, res, {});
        }
      }
    }
    case "installation": {
      switch (action) {
        case "created": {
          const payload = ctx.request
            .requestBody as components["schemas"]["webhook-installation-created"];
          // TODO
        }
        case "deleted": {
          const payload = ctx.request
            .requestBody as components["schemas"]["webhook-installation-deleted"];
          // TODO
        }
        default: {
          return json(422, res, {});
        }
      }
    }
    case "push": {
      const payload = ctx.request
        .requestBody as components["schemas"]["webhook-push"];

      const repoId = payload.repository?.id;
      if (!repoId) {
        throw new Error("Repository ID not specified");
      }

      // Look up the connected app and create a deployment job
      const apps = await db.app.findMany({
        where: {
          deploymentConfigTemplate: {
            source: DeploymentSource.GIT,
            repositoryId: repoId,
          },
          org: { githubInstallationId: { not: null } },
        },
        include: {
          org: { select: { githubInstallationId: true } },
          deploymentConfigTemplate: { include: { mounts: true } },
        },
      });

      if (apps.length === 0) {
        throw new Error("Linked app not found");
      }

      for (const app of apps) {
        // Require that the push was made to the right branch
        if (
          payload.ref !== `refs/heads/${app.deploymentConfigTemplate.branch}`
        ) {
          continue;
        }

        const octokit = await getOctokit(app.org.githubInstallationId);

        await buildAndDeploy({
          orgId: app.orgId,
          appId: app.id,
          imageRepo: app.imageRepo,
          commitSha: payload.head_commit.id,
          commitMessage: payload.head_commit.message,
          cloneURL: await generateCloneURLWithCredentials(
            octokit,
            payload.repository.html_url,
          ),
          config: {
            // Reuse the config from the previous deployment
            ...app.deploymentConfigTemplate,
            mounts: {
              createMany: { data: app.deploymentConfigTemplate.mounts },
            },
          },
          createCheckRun: true,
          octokit,
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
        });
      }

      return json(200, res, {});
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
  const { token } = (await octokit.auth({ type: "installation" })) as any;
  const url = URL.parse(originalURL);
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
  cloneURL: string | null;
  config: DeploymentConfigCreateWithoutDeploymentInput & {
    mounts: MountConfigCreateNestedManyWithoutDeploymentConfigInput;
  };
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
  cloneURL,
  config,
  ...opts
}: BuildAndDeployOptions) {
  const imageTag =
    config.source === DeploymentSource.IMAGE
      ? (config.imageTag as ImageTag)
      : (`registry.anvil.rcac.purdue.edu/anvilops/${imageRepo}:${commitSha}` as const);
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
      secret: true,
      config: { include: { mounts: true } },
      app: true,
    },
  });

  if (config.source === "GIT") {
    let checkRun:
      | Awaited<ReturnType<Octokit["rest"]["checks"]["create"]>>
      | undefined;

    if (opts.createCheckRun) {
      try {
        // Create a check on their commit that says the build is "in progress"
        checkRun = await opts.octokit.rest.checks.create({
          head_sha: commitSha,
          name: "AnvilOps",
          status: "in_progress",
          details_url: `https://anvilops.rcac.purdue.edu/app/${appId}/deployment/${deployment.id}`,
          owner: opts.owner,
          repo: opts.repo,
        });
      } catch (e) {
        console.error("Failed to create check run: ", e);
      }
    }

    let jobId: string;
    try {
      jobId = await createBuildJob({
        tag: imageRepo,
        ref: commitSha,
        gitRepoURL: cloneURL,
        imageTag,
        imageCacheTag: `registry.anvil.rcac.purdue.edu/anvilops/app-${orgId}-${appId}:build-cache`,
        deploymentSecret: secret,
        deploymentId: deployment.id,
        config,
      });
    } catch (e) {
      await db.deployment.update({
        where: { id: deployment.id },
        data: { status: "ERROR" },
      });
      if (opts.createCheckRun && checkRun?.data?.id) {
        // If a check run was created, make sure it's marked as failed
        try {
          await opts.octokit.rest.checks.update({
            check_run_id: checkRun?.data?.id,
            owner: opts.owner,
            repo: opts.repo,
            status: "completed",
            conclusion: "failure",
          });
        } catch {}
      }
      throw new Error("Failed to create build job", { cause: e });
    }

    await db.deployment.update({
      where: { id: deployment.id },
      data: { builderJobId: jobId, checkRunId: checkRun?.data?.id },
    });

    try {
      // Eagerly create the app's K8s namespace
      const namespace = createNamespaceConfig(
        getNamespace(deployment.app.subdomain),
      );
      await createOrUpdateApp(deployment.app.name, namespace, []);
    } catch {
      // If there was an error creating the namespace now, it'll be retried later when the build finishes
    }
  } else if (config.source === "IMAGE") {
    // If we're creating a deployment directly from an existing image tag, just deploy it now
    try {
      const { namespace, configs } = createAppConfigsFromDeployment(deployment);
      await createOrUpdateApp(deployment.app.name, namespace, configs);
    } catch (e) {
      if (e instanceof ApiException) {
        await db.deployment.update({
          where: { id: deployment.id },
          data: {
            status: DeploymentStatus.ERROR,
            logs: {
              create: {
                timestamp: new Date(),
                content: `Failed to apply Kubernetes resources: ${JSON.stringify(e.body)}`,
                type: "BUILD",
              },
            },
          },
        });
      } else {
        await db.deployment.update({
          where: { id: deployment.id },
          data: { status: DeploymentStatus.ERROR },
        });
      }
    }
  }
}
