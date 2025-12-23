import type { Response } from "express";
import { Readable } from "node:stream";
import { db } from "../db/index.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { generateVolumeName } from "../lib/cluster/resources/statefulset.ts";
import { forwardRequest } from "../lib/fileBrowser.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getAppFile: HandlerMap["getAppFile"] = async (
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

export const downloadAppFile: HandlerMap["downloadAppFile"] = async (
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

export const writeAppFile: HandlerMap["writeAppFile"] = async (
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

export const deleteAppFile: HandlerMap["deleteAppFile"] = async (
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
  res: Response,
) {
  const app = await db.app.getById(appId, { requireUser: { id: userId } });

  if (!app) {
    return json(404, res, {});
  }

  const config = await db.app.getDeploymentConfig(appId);

  if (config.appType !== "workload") {
    return json(400, res, {
      code: 400,
      message: "File browsing is supported only for Git and image deployments",
    });
  }

  if (
    !config.mounts.some((mount) =>
      volumeClaimName.startsWith(generateVolumeName(mount.path) + "-"),
    )
  ) {
    // This persistent volume doesn't belong to the application
    return json(400, res, {});
  }

  const response = await forwardRequest(
    getNamespace(app.namespace),
    volumeClaimName,
    path,
    requestInit,
  );

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
