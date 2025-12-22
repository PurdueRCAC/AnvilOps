import { randomBytes } from "node:crypto";
import { db } from "../db/index.ts";
import type { App } from "../db/models.ts";
import {
  deploymentConfigValidator,
  deploymentController,
} from "../domain/index.ts";
import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import { namespaceInUse } from "../lib/cluster/kubernetes.ts";
import { canManageProject, isRancherManaged } from "../lib/cluster/rancher.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { validateAppGroup, validateAppName } from "../lib/validate.ts";
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

  try {
    if (appData.config.appType === "workload") {
      await deploymentConfigValidator.validateCommonWorkloadConfig(
        appData.config,
      );
    }
    validateAppGroup(appData.appGroup);
    validateAppName(appData.name);
  } catch (e) {
    return json(400, res, {
      code: 400,
      message: e.message,
    });
  }

  let clusterUsername: string;
  if (isRancherManaged()) {
    if (!appData.projectId) {
      return json(400, res, { code: 400, message: "Project ID is required" });
    }

    let { clusterUsername: username } = await db.user.getById(req.user.id);
    if (!(await canManageProject(username, appData.projectId))) {
      return json(400, res, { code: 400, message: "Project not found" });
    }

    clusterUsername = username;
  }

  if (appData.config.source === "git" && !organization.githubInstallationId) {
    return json(403, res, {
      code: 403,
      message: "The AnvilOps GitHub App is not installed in this organization.",
    });
  }

  let app: App;
  let appGroupId: number;
  switch (appData.appGroup.type) {
    case "standalone":
      appGroupId = await db.appGroup.create(
        appData.orgId,
        `${appData.name}-${randomBytes(4).toString("hex")}`,
        true,
      );
      break;
    case "create-new":
      appGroupId = await db.appGroup.create(
        appData.orgId,
        appData.appGroup.name,
        false,
      );
      break;
    default:
      appGroupId = appData.appGroup.id;
      break;
  }

  let namespace = appData.config.subdomain;
  if (await namespaceInUse(getNamespace(namespace))) {
    namespace += "-" + Math.floor(Math.random() * 10_000);
  }

  try {
    app = await db.app.create({
      orgId: appData.orgId,
      appGroupId: appGroupId,
      name: appData.name,
      clusterUsername: clusterUsername,
      projectId: appData.projectId,
      namespace,
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
    console.error(err);
    return json(500, res, { code: 500, message: "Unable to create app." });
  }

  const { config, commitMessage } =
    await deploymentController.prepareDeploymentMetadata(
      appData.config,
      appData.orgId,
    );

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
