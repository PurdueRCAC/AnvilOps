import { ConflictError, db } from "../db/index.ts";
import type { App } from "../db/models.ts";
import { appValidator, deploymentController } from "../domain/index.ts";
import { json, type HandlerMap } from "../types.ts";
import { buildAndDeploy } from "./githubWebhook.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const createAppGroup: HandlerMap["createAppGroup"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const data = ctx.request.requestBody;

  const organization = await db.org.getById(data.orgId, {
    requireUser: { id: req.user.id },
  });
  if (!organization) {
    return json(400, res, { code: 400, message: "Organization not found" });
  }

  const user = await db.user.getById(req.user.id);
  let metadata: Awaited<
    ReturnType<typeof deploymentController.prepareDeploymentMetadata>
  >[];
  try {
    appValidator.validateAppGroupName(data.name);
    appValidator.validateApps(organization, user, ...data.apps);
    metadata = await Promise.all(
      data.apps.map((app) =>
        deploymentController.prepareDeploymentMetadata(
          app.config,
          organization.id,
        ),
      ),
    );
  } catch (e) {
    return json(400, res, { code: 400, message: e.message });
  }

  const appGroupId = await db.appGroup.create(
    organization.id,
    data.name,
    false,
  );
  let apps: App[];
  try {
    apps = await Promise.all(
      apps.map((app) =>
        db.app.create({
          orgId: organization.id,
          appGroupId,
          name: app.name,
          namespace: app.namespace,
          clusterUsername: user?.clusterUsername,
          projectId: app.projectId,
        }),
      ),
    );
  } catch (err) {
    if (err instanceof ConflictError && err.message === "subdomain") {
      return json(409, res, {
        code: 409,
        message: "Subdomain must be unique.",
      });
    } else {
      return json(500, res, { code: 500, message: "Unable to create app." });
    }
  }

  const appsAndMetadata = apps.map((app, idx) => ({
    app,
    metadata: metadata[idx],
  }));
  try {
    await Promise.all(
      appsAndMetadata.map((pair) =>
        (async () => {
          const { app, metadata } = pair;
          await buildAndDeploy({
            org: organization,
            app,
            imageRepo: app.imageRepo,
            commitMessage: metadata.commitMessage,
            config: metadata.config,
            createCheckRun: false,
          });
        })(),
      ),
    );
  } catch (err) {
    console.error(err);
    return json(500, res, {
      code: 500,
      message: "Failed to create deployments for your apps.",
    });
  }

  return json(200, res, {});
};
