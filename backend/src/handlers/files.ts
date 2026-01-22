import type { Response as ExpressResponse } from "express";
import type { OutgoingHttpHeaders } from "node:http";
import { Readable } from "node:stream";
import {
  AppNotFoundError,
  IllegalPVCAccessError,
  ValidationError,
} from "../service/common/errors.ts";
import { forwardToFileBrowser } from "../service/files.ts";
import { unsafeGenericResponse, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getAppFileHandler: HandlerMap["getAppFile"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return unsafeGenericResponse(
    await forward(
      req,
      ctx.request.params.appId,
      ctx.request.query.volumeClaimName,
      `/file?${new URLSearchParams(req.query as Record<string, string>).toString()}`,
      {},
      res,
    ),
  );
};

export const downloadAppFileHandler: HandlerMap["downloadAppFile"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return unsafeGenericResponse(
    await forward(
      req,
      ctx.request.params.appId,
      ctx.request.query.volumeClaimName,
      `/file/download?${new URLSearchParams(req.query as Record<string, string>).toString()}`,
      {},
      res,
    ),
  );
};

export const writeAppFileHandler: HandlerMap["writeAppFile"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return unsafeGenericResponse(
    await forward(
      req,
      ctx.request.params.appId,
      ctx.request.query.volumeClaimName,
      `/file?${new URLSearchParams(req.query as Record<string, string>).toString()}`,
      {
        method: "POST",
        body: Readable.toWeb(req),
        duplex: "half",
        headers: {
          "content-type": req.headers["content-type"],
          "content-length": req.headers["content-length"],
        },
      },
      res,
    ),
  );
};

export const deleteAppFileHandler: HandlerMap["deleteAppFile"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return unsafeGenericResponse(
    await forward(
      req,
      ctx.request.params.appId,
      ctx.request.query.volumeClaimName,
      `/file?${new URLSearchParams(req.query as Record<string, string>).toString()}`,
      { method: "DELETE" },
      res,
    ),
  );
};

async function forward(
  req: AuthenticatedRequest,
  appId: number,
  volumeClaimName: string,
  path: string,
  requestInit: RequestInit,
  res: ExpressResponse,
): Promise<ExpressResponse> {
  const abortController = new AbortController();

  abortController.signal.addEventListener("abort", () => res.end());
  req.on("close", () => abortController.abort());

  requestInit.signal = abortController.signal;

  let response: Response;
  try {
    response = await forwardToFileBrowser(
      req.user.id,
      appId,
      volumeClaimName,
      path,
      requestInit,
    );
  } catch (e) {
    if (e instanceof AppNotFoundError) {
      return res
        .status(404)
        .json({ code: 404, message: "App not found" })
        .end();
    } else if (e instanceof IllegalPVCAccessError) {
      return res
        .status(403)
        .json({ code: 403, message: "PersistentVolume access forbidden" })
        .end();
    } else if (e instanceof ValidationError) {
      return res.status(400).json({ code: 400, message: e.message });
    } else {
      throw e;
    }
  }

  if (response.status === 404) {
    return res.status(404).json({ code: 404, message: "Not found" });
  } else if (response.status === 500) {
    throw new Error("Failed reading file contents: " + (await response.text()));
  }

  for await (const chunk of response.body) {
    if (abortController.signal.aborted) {
      break;
    }
    if (!res.headersSent) {
      const headers: OutgoingHttpHeaders = {};
      for (const header of [
        "Content-Type",
        "Content-Length",
        "Content-Disposition",
      ]) {
        if (response.headers.has(header)) {
          headers[header] = response.headers.get(header);
        }
      }
      res.writeHead(200, headers);
    }
    res.write(chunk);
  }
}
