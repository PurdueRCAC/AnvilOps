import { randomBytes } from "node:crypto";
import { db } from "../db/index.ts";
import { App } from "../db/models.ts";
import { appValidator, deploymentController } from "../domain/index.ts";
import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import { json, type HandlerMap } from "../types.ts";
import { buildAndDeploy } from "./githubWebhook.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const createApp: HandlerMap["createApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appData = ctx.request.requestBody;

  const organization = await db.org.getById(appData.orgId, {
    requireUser: { id: req.user.id },
  });

  if (!organization) {
    return json(400, res, { code: 400, message: "Organization not found" });
  }

  let appGroupId: number;

  if (appData.appGroup.type === "add-to") {
    appGroupId = appData.appGroup.id;
    if (!(await db.appGroup.getById(appGroupId))) {
      return json(400, res, { code: 400, message: "App group not found" });
    }
  } else {
    let groupName =
      appData.appGroup.type === "create-new"
        ? appData.appGroup.name
        : `${appData.name}-${randomBytes(4).toString("hex")}`;
    try {
      appValidator.validateAppGroupName(groupName);
    } catch (e) {
      return json(400, res, { code: 400, message: e.message });
    }
    appGroupId = await db.appGroup.create(
      appData.orgId,
      groupName,
      appData.appGroup.type === "standalone",
    );
  }

  const user = await db.user.getById(req.user.id);
  let metadata: Awaited<
    ReturnType<typeof deploymentController.prepareDeploymentMetadata>
  >;
  try {
    await appValidator.validateApps(organization, user, appData);
    metadata = await deploymentController.prepareDeploymentMetadata(
      appData.config,
      organization.id,
    );
  } catch (e) {
    return json(400, res, { code: 400, message: e.message });
  }

  let app: App;
  try {
    app = await db.app.create({
      orgId: organization.id,
      appGroupId,
      name: app.name,
      namespace: app.namespace,
      clusterUsername: user?.clusterUsername,
      projectId: app.projectId,
    });
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
      // P2002 is "Unique Constraint Failed" - https://www.prisma.io/docs/orm/reference/error-reference#p2002
      const message =
        err.meta?.target === "subdomain"
          ? "Subdomain must be unique."
          : "App group already exists in organization.";
      return json(409, res, {
        code: 409,
        message,
      });
    }
    return json(500, res, { code: 500, message: "Unable to create app." });
  }

  const { config, commitMessage } = metadata;

  try {
    await buildAndDeploy({
      org: organization,
      app,
      imageRepo: app.imageRepo,
      commitMessage: commitMessage,
      config,
      createCheckRun: false,
    });
  } catch (e) {
    console.error(e);
    return json(500, res, {
      code: 500,
      message: "Failed to create a deployment for your app.",
    });
  }

  return json(200, res, { id: app.id });
};
