import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";

export const updateDeployment: HandlerMap["updateDeployment"] = async (
  ctx,
  req,
  res,
) => {
  const { secret, status } =
    ctx.request.requestBody.content["application/json"];

  if (!secret) {
    return json(401, res, {});
  }

  if (!(status in ["BUILDING", "DEPLOYING"])) return json(400, res, {});

  const batch = await db.deployment.updateMany({
    where: { secret: secret },
    data: { status: status as "BUILDING" | "DEPLOYING" },
  });

  if (batch.count === 0) {
    return json(403, res, {});
  }

  return json(200, res, {});
};
