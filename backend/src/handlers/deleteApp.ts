import { HandlerResponse, json, type HandlerMap } from "../types.ts";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { components } from "../generated/openapi.ts";
import { db } from "../lib/db.ts";
import { deleteNamespace } from "../lib/kubernetes.ts";

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
  const { subdomain } = await db.app.findUnique({
    where: {
      id: appId,
    },
    select: {
      subdomain: true,
    },
  });
  try {
    await deleteNamespace(subdomain);
  } catch (err) {
    console.error(err);
  }

  try {
    await db.app.delete({
      where: {
        id: appId,
      },
    });
  } catch (err) {
    console.error(err);
    return json(500, res, { code: 500, message: "Failed to delete app" });
  }

  await db.deployment.deleteMany({
    where: {
      appId,
    },
  });

  return json(200, res, {});
};

export default deleteApp;
