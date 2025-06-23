import { type components } from "../generated/openapi.ts";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { deleteNamespace } from "../lib/kubernetes.ts";
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
      apps: {
        some: {
          id: appId,
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
  const { subdomain, imageRepo, deployments } = await db.app.findUnique({
    where: {
      id: appId,
    },
    select: {
      subdomain: true,
      imageRepo: true,
      deployments: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  const hasResourcesStatus = ["DEPLOYING", "COMPLETE"];
  if (hasResourcesStatus.includes(deployments[0].status)) {
    try {
      await deleteNamespace(subdomain);
      await db.deployment.update({
        where: { id: deployments[0].id },
        data: { status: "STOPPED" },
      });
    } catch (err) {
      console.error(err);
    }
  }

  await db.deploymentConfig.deleteMany({ where: { deployment: { appId } } });
  await db.deployment.deleteMany({ where: { appId } });

  try {
    await deleteRepo(imageRepo);
    await db.app.delete({
      where: {
        id: appId,
      },
    });
  } catch (err) {
    console.error(err);
    return json(500, res, { code: 500, message: "Failed to delete app" });
  }

  return json(200, res, {});
};

export default deleteApp;
