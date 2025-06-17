import { LogType } from "../generated/prisma/enums.ts";
import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";

export const getAppLogs: HandlerMap["getAppLogs"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const app = await db.app.findFirst({
    where: {
      id: ctx.request.params.appId,
      org: { users: { some: { userId: req.user.id } } },
    },
  });

  if (app === null) {
    return json(404, res, {});
  }

  const logs = await db.log.findMany({
    where: { deployment: { appId: app.id }, type: LogType.RUNTIME },
    orderBy: { timestamp: "desc" },
    take: 1000,
  });

  return json(200, res, {
    available: true,
    logs: logs
      .toReversed()
      .map((line) => ((line.content as any).log as string).trim())
      .join("\n"),
  });
};
