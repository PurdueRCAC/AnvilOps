import { type Response as ExpressResponse } from "express";
import { randomBytes } from "node:crypto";
import {
  createOrUpdateApp,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { type HandlerMap, json } from "../types.ts";
import { buildAndDeploy, cancelAllOtherDeployments } from "./githubWebhook.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const revertToAppConfigTemplate: HandlerMap["revertToAppConfigTemplate"] =
  async (ctx, req: AuthenticatedRequest, res: ExpressResponse) => {
    const app = await db.app.findUnique({
      where: {
        id: ctx.request.params.appId,
        org: { users: { some: { userId: req.user.id } } },
      },
      include: {
        deploymentConfigTemplate: true,
        org: { select: { githubInstallationId: true } },
      },
    });

    if (!app) {
      return json(404, res, {});
    }

    const secret = randomBytes(32).toString("hex");

    const config = {
      ...app.deploymentConfigTemplate,
      id: undefined,
      getPlaintextEnv: undefined,
      displayEnv: undefined,
    };

    if (app.deploymentConfigTemplate.source === "GIT") {
      // If source is git, start a new build if the app was not successfully built in the past,
      // or if branches or repositories or any build settings were changed.
      const octokit = await getOctokit(app.org.githubInstallationId);
      const repo = await getRepoById(
        octokit,
        app.deploymentConfigTemplate.repositoryId,
      );
      try {
        const latestCommit = (
          await octokit.rest.repos.listCommits({
            per_page: 1,
            owner: repo.owner.login,
            repo: repo.name,
            sha: app.deploymentConfigTemplate.branch,
          })
        ).data[0];

        await buildAndDeploy({
          appId: app.id,
          orgId: app.orgId,
          imageRepo: app.imageRepo,
          commitSha: latestCommit.sha,
          commitMessage: latestCommit.commit.message,
          config,
          createCheckRun: false,
        });

        // When the new image is built and deployed successfully, it will become the imageTag of the app's template deployment config so that future redeploys use it.
      } catch (err) {
        console.error(err);
        return json(500, res, {
          code: 500,
          message: "Failed to create a deployment for your app.",
        });
      }
    } else {
      const deployment = await db.deployment.create({
        data: {
          config: {
            create: config,
          },
          status: "DEPLOYING",
          app: { connect: { id: app.id } },
          commitMessage: "Update to deployment configuration",
          secret,
        },
        select: {
          id: true,
          appId: true,
          app: {
            include: {
              appGroup: true,
              org: { select: { githubInstallationId: true } },
            },
          },
          config: true,
        },
      });

      await cancelAllOtherDeployments(deployment.id, deployment.app, true);

      try {
        const { namespace, configs, postCreate } =
          createAppConfigsFromDeployment(deployment);

        const { KubernetesObjectApi: api } = await getClientsForRequest(
          req.user.id,
          deployment.app.projectId,
          ["KubernetesObjectApi"],
        );
        await createOrUpdateApp(api, app.name, namespace, configs, postCreate);
        await db.deployment.update({
          where: { id: deployment.id },
          data: { status: "COMPLETE" },
        });
      } catch (err) {
        console.error(err);
        await db.deployment.update({
          where: {
            id: deployment.id,
          },
          data: {
            status: "ERROR",
          },
        });
        return json(200, res, {});
      }
    }

    await db.app.update({
      where: { id: app.id },
      data: { isPreviewing: false },
    });
    return json(200, res, {});
  };
