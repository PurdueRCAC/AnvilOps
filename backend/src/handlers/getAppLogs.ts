import { once } from "node:events";
import type { components } from "../generated/openapi.ts";
import { db, subscribe } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

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
    return json(404, res, { code: 404, message: "App not found." });
  }

  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const sendLog = async (log: components["schemas"]["LogLine"]) => {
    const readyForMoreContent = res.write(
      `event: log\nid: ${log.id}\ndata: ${JSON.stringify(log)}\n\n`,
    );
    if (!readyForMoreContent) {
      await once(res, "drain");
    }
  };

  // Pull logs from Postgres and send them to the client as they come in
  if (typeof ctx.request.params.deploymentId !== "number") {
    // Extra sanity check due to potential SQL injection below in `subscribe`; should never happen because of openapi-backend's request validation and additional sanitization in `subscribe()`
    return json(400, res, {
      code: 400,
      message: "Deployment ID must be number.",
    });
  }

  let lastLogId = -1;

  {
    // The Last-Event-Id header allows SSE streams to resume after being disconnected: https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header
    const lastEventId = req.headers["last-event-id"];
    if (lastEventId) {
      try {
        lastLogId = parseInt(lastEventId.toString());
      } catch {}
    }
  }

  const fetchNewLogs = async () => {
    // Fetch them in reverse order so that we can take only the 500 most recent lines
    const newLogs = await db.log.findMany({
      where: {
        id: { gt: lastLogId },
        deploymentId: ctx.request.params.deploymentId,
        type: ctx.request.query.type,
      },
      orderBy: [{ timestamp: "desc" }, { index: "desc" }],
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
        stream: log.stream,
        log: log.content as string,
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

  res.write("event: pastLogsSent\ndata:\n\n"); // Let the browser know that all previous logs have been sent. If none were received, then there are no logs for this deployment so far.
};
