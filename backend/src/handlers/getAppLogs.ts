import { once } from "node:events";
import type { components } from "../generated/openapi.ts";
import type { AuthenticatedRequest } from "../lib/api.ts";
import { db, subscribe } from "../lib/db.ts";
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

  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const sendLog = async (log: components["schemas"]["LogLine"]) => {
    const readyForMoreContent = res.write(`data: ${JSON.stringify(log)}\n\n`);
    if (!readyForMoreContent) {
      await once(res, "drain");
    }
  };

  // Pull logs from Postgres and send them to the client as they come in
  if (typeof ctx.request.params.deploymentId !== "number") {
    // Extra sanity check due to potential SQL injection below in `subscribe`; should never happen because of openapi-backend's request validation
    return json(400, res, {});
  }

  let lastLogId = -1;

  const fetchNewLogs = async () => {
    // Fetch them in reverse order so that we can take only the 500 most recent lines
    const newLogs = await db.log.findMany({
      where: {
        id: { gt: lastLogId },
        deploymentId: ctx.request.params.deploymentId,
        type: ctx.request.query.type,
      },
      orderBy: [{ createdAt: "desc" }, { index: "desc" }],
      take: 500,
    });
    if (newLogs.length > 0) {
      lastLogId = newLogs[0].id;
    }
    for (let i = newLogs.length - 1; i >= 0; i--) {
      const log = newLogs[i];
      await sendLog({
        id: log.id,
        type: log.type,
        log: (log.content as any).log as string,
        pod: log.podName,
        time: log.timestamp.toISOString(),
      });
    }
  };

  // When new logs come in, send them to the client
  const unsubscribe = await subscribe(
    `deployment_${ctx.request.params.deploymentId}_logs`,
    fetchNewLogs,
  );

  req.on("close", async () => {
    await unsubscribe();
  });

  // Send all previous logs now
  await fetchNewLogs();
};
