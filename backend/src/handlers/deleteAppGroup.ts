import { type components } from "../generated/openapi.ts";
import {
  deleteNamespace,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { db } from "../lib/db.ts";
import { deleteRepo } from "../lib/registry.ts";
import { json, type HandlerMap, type HandlerResponse } from "../types.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const deleteAppGroup: HandlerMap["deleteAppGroup"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
): Promise<
  HandlerResponse<{
    200: { headers: { [name: string]: unknown }; content?: never };
    404: { headers: { [name: string]: unknown }; content?: never };
    500: {
      headers: { [name: string]: unknown };
      content: { "application/json": components["schemas"]["ApiError"] };
    };
  }>
> => {
  const appGroupId = ctx.request.params.appGroupId;
  const org = await db.organization.findFirst({
    where: {
      appGroups: {
        some: {
          id: appGroupId,
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

  const appGroup = await db.appGroup.findUnique({
    where: {
      id: appGroupId,
    },
    include: {
      apps: {
        include: {
          deployments: true,
        },
      },
    },
  });

  if (!ctx.request.requestBody.keepNamespace) {
    try {
      await Promise.all(
        appGroup.apps.map((app) => async () => {
          const { KubernetesObjectApi: api } = await getClientsForRequest(
            req.user.id,
            app.projectId,
            ["KubernetesObjectApi"],
          );
          deleteNamespace(api, getNamespace(app.namespace));
        }),
      );
    } catch (err) {
      console.error("Failed to delete namespace:", err);
    }
  }
  try {
    const repos = appGroup.apps.map((app) => app.imageRepo);
    const appIds = appGroup.apps.map((app) => app.id);
    await db.$transaction(async (tx) => {
      await tx.log.deleteMany({
        where: {
          deployment: {
            appId: { in: appIds },
          },
        },
      });

      // Cascade delete deployments
      await tx.deploymentConfig.deleteMany({
        where: {
          deployment: {
            appId: { in: appIds },
          },
        },
      });

      await tx.app.deleteMany({
        where: { id: { in: appIds } },
      });

      await tx.appGroup.delete({ where: { id: appGroupId } });
    });
    try {
      await Promise.all(
        repos.map(async (repo) => {
          if (repo) await deleteRepo(repo);
        }),
      );
    } catch (e) {
      console.error("Failed to delete image repository: ", e);
    }
  } catch (err) {
    console.error(err);
    return json(500, res, {
      code: 500,
      message: "There was a problem deleting your apps",
    });
  }
  return json(200, res, {});
};
