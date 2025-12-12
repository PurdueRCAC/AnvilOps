import type { Request, Response } from "express";
import { db } from "../db/index.ts";
import { env } from "../lib/env.ts";
import { getLocalRepo, importRepo } from "../lib/import.ts";
import { getOctokit } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const importGitRepoCreateState: HandlerMap["importGitRepoCreateState"] =
  async (ctx, req: AuthenticatedRequest, res) => {
    const { sourceURL, destIsOrg, destOwner, destRepo, makePrivate } =
      ctx.request.requestBody;

    const org = await db.org.getById(ctx.request.params.orgId, {
      requireUser: { id: req.user.id, permissionLevel: "OWNER" },
    });

    if (!org) {
      return json(404, res, { code: 404, message: "Organization not found." });
    }

    if (!org.githubInstallationId) {
      return json(403, res, {
        code: 403,
        message: "Organization has not installed the GitHub App",
      });
    }

    const stateId = await db.repoImportState.create(
      req.user.id,
      org.id,
      destIsOrg,
      destOwner,
      destRepo,
      makePrivate,
      sourceURL,
    );

    const octokit = await getOctokit(org.githubInstallationId);
    const isLocalRepo = !!(await getLocalRepo(octokit, URL.parse(sourceURL)));

    if (destIsOrg || isLocalRepo) {
      // We can create the repo now
      // Fall into the importGitRepo handler directly
      return await importRepoHandler(stateId, undefined, req.user.id, req, res);
    } else {
      // We need a user access token
      const redirectURL = `${req.protocol}://${req.host}/import-repo`;
      return json(200, res, {
        url: `${env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${stateId}&redirect_uri=${encodeURIComponent(redirectURL)}`,
      });
    }
  };

export const importGitRepo: HandlerMap["importGitRepo"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  return await importRepoHandler(
    ctx.request.requestBody.state,
    ctx.request.requestBody.code,
    req.user.id,
    req,
    res,
  );
};

async function importRepoHandler(
  stateId: string,
  code: string | undefined,
  userId: number,
  req: Request,
  res: Response,
) {
  const state = await db.repoImportState.get(stateId, userId);

  if (!state) {
    return json(404, res, {});
  }

  const org = await db.org.getById(state.orgId);

  const repoId = await importRepo(
    org.githubInstallationId,
    URL.parse(state.srcRepoURL),
    state.destIsOrg,
    state.destRepoOwner,
    state.destRepoName,
    state.makePrivate,
    code,
  );

  if (repoId === "code needed") {
    // There was a problem creating the repo directly from a template and we didn't provide an OAuth code to authorize the user.
    // We need to start over.
    const redirectURL = `${req.protocol}://${req.host}/import-repo`;
    return json(200, res, {
      url: `${env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${state.id}&redirect_uri=${encodeURIComponent(redirectURL)}`,
    });
  }

  await db.repoImportState.delete(state.id);

  // The repository was created successfully. If repoId is null, then
  // we're not 100% sure that it was created, but no errors were thrown.
  // It's probably just a big repository that will be created soon.

  return json(201, res, { orgId: state.orgId, repoId });
}
