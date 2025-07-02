import { type components } from "../generated/openapi.ts";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { deleteNamespace, getNamespace } from "../lib/kubernetes.ts";
import { deleteRepo } from "../lib/registry.ts";
import { json, type HandlerMap, type HandlerResponse } from "../types.ts";

const deleteApp: HandlerMap["deleteApp"] = async (
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
          },
        },
        deploymentConfigTemplateId: true,
      },
    });

  try {
    await deleteNamespace(getNamespace(subdomain));
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
    await deleteRepo(imageRepo);

    // cascade deletes App
    await db.deploymentConfig.delete({
      where: { id: deploymentConfigTemplateId },
    });
    if (appGroup._count.apps === 0) {
      await db.appGroup.delete({ where: { id: appGroup.id } });
    }
  } catch (err) {
    console.error(err);
    return json(500, res, { code: 500, message: "Failed to delete app" });
  }

  return json(200, res, {});
};

export default deleteApp;
