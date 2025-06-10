import { Webhooks } from "@octokit/webhooks";
import type { components } from "../generated/openapi.ts";
import { createBuildJob } from "../lib/builder.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import { randomBytes } from "node:crypto";

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
  const action = ctx.request.requestBody.content["application/json"]["action"];

  switch (requestType) {
    case "repository": {
      switch (action) {
        case "renamed": {
          const payload = ctx.request.requestBody.content[
            "application/json"
          ] as components["schemas"]["webhook-repository-renamed"];

          // Change the repository URL of connected apps to point to the new URL
          await db.app.updateMany({
            where: { repositoryId: payload.repository.id },
            data: {
              repositoryURL: payload.repository.git_url,
            },
          });
        }
        case "transferred": {
          const payload = ctx.request.requestBody.content[
            "application/json"
          ] as components["schemas"]["webhook-repository-transferred"];
          // TODO
        }
        case "deleted": {
          const payload = ctx.request.requestBody.content[
            "application/json"
          ] as components["schemas"]["webhook-repository-deleted"];
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
          const payload = ctx.request.requestBody.content[
            "application/json"
          ] as components["schemas"]["webhook-installation-created"];
          // TODO
        }
        case "deleted": {
          const payload = ctx.request.requestBody.content[
            "application/json"
          ] as components["schemas"]["webhook-installation-deleted"];
          // TODO
        }
        default: {
          return json(422, res, {});
        }
      }
    }
    case "push": {
      const payload = ctx.request.requestBody.content[
        "application/json"
      ] as components["schemas"]["webhook-push"];

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

        const imageTag =
          `registry.anvil.rcac.purdue.edu/anvilops/app-${app.orgId}-${app.id}:${payload.head_commit.id}` as const;
        const secret = randomBytes(32).toString("hex");
        const deployment = await db.deployment.create({
          data: {
            appId: app.id,
            commitHash: payload.head_commit.id,
            commitMessage: payload.head_commit.message,
            imageTag: imageTag,
            secret: secret,
          },
        });

        const jobId = await createBuildJob(
          "dockerfile",
          payload.repository.git_url,
          imageTag,
          `registry.anvil.rcac.purdue.edu/anvilops/app-${app.orgId}-${app.id}:build-cache`,
          secret,
        );

        await db.deployment.update({
          where: { id: deployment.id },
          data: { builderJobId: jobId },
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
