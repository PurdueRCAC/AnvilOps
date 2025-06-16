import { Webhooks } from "@octokit/webhooks";
import { randomBytes } from "node:crypto";
import type { Octokit } from "octokit";
import type { components } from "../generated/openapi.ts";
import type {
  DeploymentConfigCreateWithoutDeploymentInput,
  StorageConfigCreateWithoutDeploymentInput,
} from "../generated/prisma/models.ts";
import { createBuildJob } from "../lib/builder.ts";
import { db } from "../lib/db.ts";
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
          repositoryId: repoId,
          org: { githubInstallationId: { not: null } },
        },
        include: {
          org: { select: { githubInstallationId: true } },
          deployments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: {
              config: {
                select: {
                  builder: true,
                  dockerfilePath: true,
                  env: true,
                  port: true,
                  replicas: true,
                  rootDir: true,
                  secrets: true,
                },
              },
              storageConfig: {
                select: {
                  amount: true,
                  replicas: true,
                  image: true,
                  port: true,
                  mountPath: true,
                },
              },
            },
          },
        },
      });

      if (apps.length === 0) {
        throw new Error("Linked app not found");
      }

      for (const app of apps) {
        // Require that the push was made to the right branch
        if (payload.ref !== `refs/heads/${app.repositoryBranch}`) {
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
          config: app.deployments[0].config, // Reuse the config from the previous deployment
          storageConfig: app.deployments[0].storageConfig,
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
  cloneURL: string;
  config: DeploymentConfigCreateWithoutDeploymentInput;
  storageConfig?: StorageConfigCreateWithoutDeploymentInput;
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
  storageConfig,
  ...opts
}: BuildAndDeployOptions) {
  const imageTag =
    `registry.anvil.rcac.purdue.edu/anvilops/${imageRepo}:${commitSha}` as const;
  const secret = randomBytes(32).toString("hex");
  const deployment = await db.deployment.create({
    data: {
      app: { connect: { id: appId } },
      commitHash: commitSha,
      commitMessage: commitMessage,
      imageTag: imageTag,
      secret: secret,
      config: {
        create: config,
      },
      storageConfig: storageConfig ? { create: storageConfig } : undefined,
    },
    select: {
      id: true,
      app: { select: { repositoryId: true } },
    },
  });

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
}
