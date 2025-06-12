import { Webhooks } from "@octokit/webhooks";
import { randomBytes } from "node:crypto";
import type { Octokit } from "octokit";
import type { components } from "../generated/openapi.ts";
import type { DeploymentConfigCreateWithoutDeploymentInput } from "../generated/prisma/models.ts";
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
        where: { repositoryId: repoId },
        include: {
          org: true,
          deployments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: { config: true },
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

        await buildAndDeploy(
          app.orgId,
          app.id,
          app.imageRepo,
          payload.head_commit.id,
          payload.head_commit.message,
          await generateCloneURLWithCredentials(
            octokit,
            payload.repository.html_url,
          ),
          app.deployments[0].config, // Reuse the config from the previous deployment
        );
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

export async function buildAndDeploy(
  orgId: number,
  appId: number,
  imageRepo: string,
  commitSha: string,
  commitMessage: string,
  cloneURL: string,
  config: DeploymentConfigCreateWithoutDeploymentInput,
) {
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
    },
  });

  let jobId: string;
  try {
    jobId = await createBuildJob({
      tag: imageRepo,
      gitRepoURL: cloneURL,
      imageTag,
      imageCacheTag: `registry.anvil.rcac.purdue.edu/anvilops/app-${orgId}-${appId}:build-cache`,
      deploymentSecret: secret,
      config,
    });
  } catch (e) {
    await db.deployment.update({
      where: { id: deployment.id },
      data: { status: "ERROR" },
    });
    throw new Error("Failed to create build job", { cause: e });
  }

  await db.deployment.update({
    where: { id: deployment.id },
    data: { builderJobId: jobId },
  });
}
