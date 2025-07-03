import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { forwardRequest } from "../lib/fileBrowser.ts";
import { getNamespace } from "../lib/kubernetes.ts";
import { json, type HandlerMap } from "../types.ts";

export const getAppFile: HandlerMap["getAppFile"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return await forward(
    req.user.id,
    ctx.request.params.appId,
    ctx.request.query.volumeClaimName,
    req,
    res,
    false,
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
    req,
    res,
    true,
  );
};

async function forward(
  userId: number,
  appId: number,
  volumeClaimName: string,
  req: Request,
  res: Response,
  download: boolean,
) {
  const app = await db.app.findFirst({
    where: {
      id: appId,
      org: { users: { some: { userId } } },
    },
    include: { deploymentConfigTemplate: { include: { mounts: true } } },
  });

  const response = await forwardRequest(
    getNamespace(app.subdomain),
    volumeClaimName,
    `/file${download ? "/download" : ""}?${new URLSearchParams(req.query as Record<string, string>).toString()}`,
    {
      method: "GET",
    },
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
      res.writeHead(200, {
        "Content-Type": response.headers.get("Content-Type"),
      });
    }
    res.write(value);
  }
}

export const writeAppFile: HandlerMap["writeAppFile"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const app = await db.app.findFirst({
    where: {
      id: ctx.request.params.appId,
      org: { users: { some: { userId: req.user.id } } },
    },
    include: { deploymentConfigTemplate: { include: { mounts: true } } },
  });

  const response = await forwardRequest(
    getNamespace(app.subdomain),
    ctx.request.query.volumeClaimName,
    `/files?${new URLSearchParams(req.query as Record<string, string>).toString()}`,
    {
      method: "POST",
      body: req.body,
    },
  );

  if (response.status !== 200) {
    if (response.status === 404) {
      return json(404, res, {});
    }
    throw new Error("Failed to upload file: " + (await response.text()));
  } else {
    return json(201, res, {});
  }
};
