import { env } from "../lib/env.ts";
import { OrgNotFoundError } from "../service/common/errors.ts";
import {
  createRepoImportState,
  importGitRepo,
} from "../service/importGitRepo.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const importGitRepoCreateStateHandler: HandlerMap["importGitRepoCreateState"] =
  async (ctx, req: AuthenticatedRequest, res) => {
    try {
      const result = await createRepoImportState(
        ctx.request.params.orgId,
        req.user.id,
        ctx.request.requestBody,
      );

      if (result.codeNeeded === true) {
        // We need a user access token
        const redirectURL = `${req.protocol}://${req.host}/import-repo`;
        return json(200, res, {
          url: `${env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${result.oauthState}&redirect_uri=${encodeURIComponent(redirectURL)}`,
        });
      } else {
        // The repo was created immediately & we don't need to redirect to GitHub for authorization
        return json(201, res, { orgId: result.orgId, repoId: result.repoId });
      }
    } catch (e) {
      if (e instanceof OrgNotFoundError) {
        return json(404, res, {
          code: 404,
          message: "Organization not found.",
        });
      }
    }
  };

export const importGitRepoHandler: HandlerMap["importGitRepo"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const result = await importGitRepo(
    ctx.request.requestBody.state,
    ctx.request.requestBody.code,
    req.user.id,
  );

  if (result.codeNeeded === true) {
    // Should never happen since we're providing a GitHub authorization code to importGitRepo
    return json(500, res, {
      code: 500,
      message: "GitHub authorization state mismatch",
    });
  } else {
    return json(201, res, { orgId: result.orgId, repoId: result.repoId });
  }
};
