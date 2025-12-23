import type { Response as ExpressResponse } from "express";
import { Readable } from "node:stream";
import {
  AppNotFoundError,
  IllegalPVCAccessError,
} from "../service/common/errors.ts";
import { forwardToFileBrowser } from "../service/files.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getAppFileHandler: HandlerMap["getAppFile"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return await forward(
    req.user.id,
    ctx.request.params.appId,
    ctx.request.query.volumeClaimName,
    `/file?${new URLSearchParams(req.query as Record<string, string>).toString()}`,
    {},
    res,
  );
};

export const downloadAppFileHandler: HandlerMap["downloadAppFile"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return await forward(
    req.user.id,
    ctx.request.params.appId,
    ctx.request.query.volumeClaimName,
    `/file/download?${new URLSearchParams(req.query as Record<string, string>).toString()}`,
    {},
    res,
  );
};

export const writeAppFileHandler: HandlerMap["writeAppFile"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return await forward(
    req.user.id,
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
  );
};

export const deleteAppFileHandler: HandlerMap["deleteAppFile"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return await forward(
    req.user.id,
    ctx.request.params.appId,
    ctx.request.query.volumeClaimName,
    `/file?${new URLSearchParams(req.query as Record<string, string>).toString()}`,
    { method: "DELETE" },
    res,
  );
};

async function forward(
  userId: number,
  appId: number,
  volumeClaimName: string,
  path: string,
  requestInit: RequestInit,
  res: ExpressResponse,
) {
  let response: Response;
  try {
    response = await forwardToFileBrowser(
      userId,
      appId,
      volumeClaimName,
      path,
      requestInit,
    );
  } catch (e) {
    if (e instanceof AppNotFoundError) {
      return json(404, res, {});
    } else if (e instanceof IllegalPVCAccessError) {
      return json(403, res, {});
    }
    throw e;
  }

  if (response.status === 404) {
    return json(404, res, {});
  } else if (response.status === 500) {
    throw new Error("Failed reading file contents: " + (await response.text()));
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      res.end();
      break;
    }
    if (!res.headersSent) {
      const headers = {};
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
    res.write(value);
  }
}
