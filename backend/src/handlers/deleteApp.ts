import { type components } from "../generated/openapi.ts";
import {
  createOrUpdateApp,
  deleteNamespace,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import {
  createAppConfigsFromDeployment,
  getNamespace,
} from "../lib/cluster/resources.ts";
import { db } from "../lib/db.ts";
import { deleteRepo } from "../lib/registry.ts";
import { json, type HandlerMap, type HandlerResponse } from "../types.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const deleteApp: HandlerMap["deleteApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
): Promise<
  HandlerResponse<{
    200: { headers: { [name: string]: unknown }; content?: never };
    401: { headers: { [name: string]: unknown }; content?: never };
    404: { headers: { [name: string]: unknown }; content?: never };
    500: {
      headers: { [name: string]: unknown };
      content: { "application/json": components["schemas"]["ApiError"] };
    };
  }>
> => {
  const appId = ctx.request.params.appId;
  const org = await db.organization.findFirst({
    where: {
      appGroups: {
        some: {
          apps: {
            some: {
              id: appId,
            },
          },
        },
      },
      users: {
        some: {
          userId: req.user.id,
          permissionLevel: "OWNER",
        },
      },
    },
  });

  if (!org) {
    return json(404, res, {});
  }

  const {
    subdomain,
    projectId,
    imageRepo,
    appGroup,
    deployments: [lastDeployment],
  } = await db.app.findUnique({
    where: {
      id: appId,
    },
    select: {
      id: true,
      name: true,
      displayName: true,
      logIngestSecret: true,
      subdomain: true,
      imageRepo: true,
      projectId: true,
      appGroup: {
        select: {
          id: true,
          _count: true,
        },
      },
      deployments: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        include: {
          config: true,
          app: {
            select: {
              id: true,
              name: true,
              displayName: true,
              logIngestSecret: true,
              subdomain: true,
              org: { select: { githubInstallationId: true } },
              projectId: true,
              appGroup: true,
            },
          },
        },
      },
    },
  });

  if (!ctx.request.requestBody.keepNamespace) {
    try {
      const { KubernetesObjectApi: api } = await getClientsForRequest(
        req.user.id,
        projectId,
        ["KubernetesObjectApi"],
      );
      await deleteNamespace(api, getNamespace(subdomain));
    } catch (err) {
      console.error("Failed to delete namespace:", err);
    }
  } else if (lastDeployment.config.collectLogs) {
    // If the log shipper was enabled, redeploy without it
    lastDeployment.config.collectLogs = false; // <-- Disable log shipping
    const { namespace, configs, postCreate } =
      await createAppConfigsFromDeployment(lastDeployment);

    const { KubernetesObjectApi: api } = await getClientsForRequest(
      req.user.id,
      lastDeployment.app.projectId,
      ["KubernetesObjectApi"],
    );
    await createOrUpdateApp(
      api,
      lastDeployment.app.name,
      namespace,
      configs,
      postCreate,
    );
  }

  await db.log.deleteMany({
    where: { deployment: { appId } },
  });

  // cascade deletes Deployments
  await db.deploymentConfig.deleteMany({
    where: { deployment: { appId } },
  });

  try {
    if (imageRepo) await deleteRepo(imageRepo);
  } catch (err) {
    console.error("Couldn't delete image repository:", err);
  }

  try {
    await db.app.delete({ where: { id: appId } });
    if (appGroup._count.apps === 1) {
      // If this was the last app in the group, delete the group as well
      await db.appGroup.delete({ where: { id: appGroup.id } });
    }
  } catch (err) {
    console.error(err);
    return json(500, res, { code: 500, message: "Failed to delete app" });
  }

  return json(200, res, {});
};
