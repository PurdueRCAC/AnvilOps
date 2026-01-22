import { OrgNotFoundError } from "../service/common/errors.ts";
import {
  continueImportGitRepo,
  importGitRepo,
} from "../service/importGitRepo.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const importGitRepoHandler: HandlerMap["importGitRepoCreateState"] =
  async (ctx, req: AuthenticatedRequest, res) => {
    try {
      const result = await importGitRepo(
        ctx.request.params.orgId,
        req.user.id,
        ctx.request.requestBody,
      );

      if (result.codeNeeded === true) {
        // We need a user access token
        return json(200, res, { url: result.url });
      } else {
        // The repo was created immediately & we don't need to redirect to GitHub for authorization
        return json(201, res, {
          orgId: result.orgId,
          repoId: result.repoId,
          repoName: ctx.request.requestBody.destRepo,
        });
      }
    } catch (e) {
      if (e instanceof OrgNotFoundError) {
        return json(404, res, {
          code: 404,
          message: "Organization not found.",
        });
      }
      throw e;
    }
  };

export const importGitRepoContinueHandler: HandlerMap["importGitRepo"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const result = await continueImportGitRepo(
    ctx.request.requestBody.state,
    ctx.request.requestBody.code,
    req.user.id,
  );
  return json(201, res, {
    orgId: result.orgId,
    repoId: result.repoId,
    repoName: result.repoName,
  });
};
