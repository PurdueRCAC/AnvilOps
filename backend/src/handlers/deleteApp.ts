import { type components } from "../generated/openapi.ts";
import { type AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import {
  deleteNamespace,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { deleteRepo } from "../lib/registry.ts";
import { json, type HandlerMap, type HandlerResponse } from "../types.ts";

export const deleteApp: HandlerMap["deleteApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
): Promise<
  HandlerResponse<{
    200: { headers: { [name: string]: unknown }; content?: never };
    401: { headers: { [name: string]: unknown }; content?: never };
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
    return json(401, res, {});
  }
  const { subdomain, imageRepo, appGroup, deploymentConfigTemplateId } =
    await db.app.findUnique({
      where: {
        id: appId,
      },
      select: {
        subdomain: true,
        imageRepo: true,
        appGroup: {
          select: {
            id: true,
            _count: true,
            projectId: true,
          },
        },
        deploymentConfigTemplateId: true,
      },
    });

  try {
    const { KubernetesObjectApi: api } = await getClientsForRequest(
      req.user.id,
      appGroup.projectId,
      ["KubernetesObjectApi"],
    );
    await deleteNamespace(api, getNamespace(subdomain));
  } catch (err) {
    console.error("Failed to delete namespace:", err);
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
    // cascade deletes App
    await db.deploymentConfig.delete({
      where: { id: deploymentConfigTemplateId },
    });
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
