import { Webhooks } from "@octokit/webhooks";
import { randomBytes } from "node:crypto";
import type { components } from "../generated/openapi.ts";
import { createBuildJob } from "../lib/builder.ts";
import { db } from "../lib/db.ts";
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
          deployments: true,
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

        await createDeployment(
          app.orgId,
          app.id,
          payload.head_commit.id,
          payload.head_commit.message,
          payload.repository.html_url,
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

export async function createDeployment(
  orgId: number,
  appId: number,
  commitSha: string,
  commitMessage: string,
  cloneURL: string,
) {
  const imageTag =
    `registry.anvil.rcac.purdue.edu/anvilops/app-${orgId}-${appId}:${commitSha}` as const;
  const secret = randomBytes(32).toString("hex");
  const deployment = await db.deployment.create({
    data: {
      appId: appId,
      commitHash: commitSha,
      commitMessage: commitMessage,
      imageTag: imageTag,
      secret: secret,
    },
  });

  let jobId: string;
  try {
    jobId = await createBuildJob(
      `${appId}-${deployment.id}`,
      "dockerfile",
      cloneURL,
      imageTag,
      `registry.anvil.rcac.purdue.edu/anvilops/app-${orgId}-${appId}:build-cache`,
      secret,
    );
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
