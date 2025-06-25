import type { Response } from "express";
import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { getLocalRepo, importRepo } from "../lib/import.ts";
import { getOctokit } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";

export const importGitRepoCreateState: HandlerMap["importGitRepoCreateState"] =
  async (ctx, req: AuthenticatedRequest, res) => {
    const { sourceURL, destIsOrg, destOwner, destRepo, makePrivate } =
      ctx.request.requestBody;

    const org = await db.organization.findFirst({
      where: {
        id: ctx.request.params.orgId,
        users: { some: { userId: req.user.id, permissionLevel: "OWNER" } },
      },
    });

    if (!org) {
      return json(404, res, {});
    }

    if (!org.githubInstallationId) {
      return json(400, res, {
        code: 400,
        message: "Organization has not installed the GitHub App",
      });
    }

    const state = await db.repoImportState.create({
      data: {
        destRepoName: destRepo,
        destRepoOwner: destOwner,
        makePrivate,
        srcRepoURL: sourceURL,
        userId: req.user.id,
        orgId: org.id,
        destIsOrg: destIsOrg,
      },
    });

    const octokit = await getOctokit(org.githubInstallationId);
    const isLocalRepo = !!(await getLocalRepo(octokit, URL.parse(sourceURL)));

    if (destIsOrg || isLocalRepo) {
      // We can create the repo now
      // Fall into the importGitRepo handler directly
      return await importRepoHandler(state.id, undefined, req.user.id, res);
    } else {
      // We need a user access token
      const redirectURL = `${req.protocol}://${req.host}/import-repo`;
      return json(200, res, {
        url: `${process.env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&state=${state.id}&redirect_uri=${encodeURIComponent(redirectURL)}`,
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
    res,
  );
};

async function importRepoHandler(
  stateId: string,
  code: string | undefined,
  userId: number,
  res: Response,
) {
  const state = await db.repoImportState.delete({
    where: {
      id: stateId,
      userId: userId,
      createdAt: {
        // Only consider states that were created in the last 5 minutes
        gte: new Date(new Date().getTime() - 5 * 60 * 1000),
      },
    },
    include: { org: { select: { githubInstallationId: true } } },
  });

  if (!state) {
    return json(404, res, {});
  }

  const repoId = await importRepo(
    userId,
    state.org.githubInstallationId,
    URL.parse(state.srcRepoURL),
    state.destIsOrg,
    state.destRepoOwner,
    state.destRepoName,
    state.makePrivate,
    false, // Only include the default branch
    code,
  );

  // The repository was created successfully. If repoId is null, then
  // we're not 100% sure that it was created, but no errors were thrown.
  // It's probably just a big repository that will be created soon.

  return json(201, res, { repoId });
}
