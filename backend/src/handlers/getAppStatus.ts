import { once } from "node:events";
import { AppNotFoundError, ValidationError } from "../service/common/errors.ts";
import { getAppStatus, type StatusUpdate } from "../service/getAppStatus.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getAppStatusHandler: HandlerMap["getAppStatus"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const abortController = new AbortController();

  abortController.signal.addEventListener("abort", () => res.end());
  req.on("close", () => abortController.abort());

  let lastStatus: string;
  const update = async (newStatus: StatusUpdate) => {
    const str = JSON.stringify(newStatus);
    if (str !== lastStatus) {
      lastStatus = str;
      const canWriteMoreContent = res.write(`data: ${str}\n\n`);
      if (!canWriteMoreContent) {
        await once(res, "drain");
      }
    }
  };

  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  try {
    await getAppStatus(
      ctx.request.params.appId,
      req.user.id,
      abortController,
      update,
    );
  } catch (e) {
    if (e instanceof ValidationError) {
      return json(400, res, { code: 400, message: e.message });
    }

    if (e instanceof AppNotFoundError) {
      return json(404, res, { code: 404, message: "App not found." });
    }
    throw e;
  }
};
