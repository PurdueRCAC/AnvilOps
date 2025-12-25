import { once } from "node:events";
import type { components } from "../generated/openapi.ts";
import { AppNotFoundError } from "../service/common/errors.ts";
import { getAppLogs } from "../service/getAppLogs.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getAppLogsHandler: HandlerMap["getAppLogs"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    const abortController = new AbortController();
    req.on("close", () => abortController.abort());

    const sendLog = async (log: components["schemas"]["LogLine"]) => {
      const readyForMoreContent = res.write(
        `event: log\nid: ${log.id}\ndata: ${JSON.stringify(log)}\n\n`,
      );
      if (!readyForMoreContent) {
        await once(res, "drain");
      }
    };

    res.set({
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // The Last-Event-Id header allows SSE streams to resume after being disconnected: https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header
    let lastLogId = -1;
    const lastEventIdHeader = req.headers["last-event-id"];
    if (lastEventIdHeader) {
      try {
        lastLogId = parseInt(lastEventIdHeader.toString());
      } catch {}
    }

    await getAppLogs(
      ctx.request.params.appId,
      ctx.request.params.deploymentId,
      req.user.id,
      ctx.request.query.type,
      lastLogId,
      abortController,
      sendLog,
    );

    res.write("event: pastLogsSent\ndata:\n\n"); // Let the browser know that all previous logs have been sent. If none were received, then there are no logs for this deployment so far.
  } catch (e) {
    if (e instanceof AppNotFoundError) {
      return json(404, res, { code: 404, message: "App not found." });
    }
    throw e;
  }
};
