import type { Response } from "express";
import {
  GitHubInstallationForbiddenError,
  GitHubOAuthAccountMismatchError,
  GitHubOAuthStateMismatchError,
  InstallationNotFoundError,
  OrgNotFoundError,
} from "../service/common/errors.ts";
import { processGitHubOAuthResponse } from "../service/githubOAuthCallback.ts";
import {
  redirect,
  type HandlerMap,
  type HandlerResponse,
  type ResponseMap,
} from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

/**
 * This endpoint is called after the user signs in with GitHub.
 *
 * After they install the app, we need to verify that the installation ID they provide us is theirs.
 * To do this, we redirect BACK to GitHub, get authorization, and then look up their installed apps.
 *
 * In this handler, we perform that verification and then redirect back to the frontend.
 */
export const githubOAuthCallbackHandler: HandlerMap["githubOAuthCallback"] =
  async (ctx, req: AuthenticatedRequest, res) => {
    try {
      const result = await processGitHubOAuthResponse(
        ctx.request.query.state,
        ctx.request.query.code,
        req.user.id,
      );

      if (result === "done") {
        return redirect(302, res, "/dashboard");
      } else if (result === "approval-needed") {
        return redirect(302, res, "/github-approval-pending");
      } else {
        result satisfies never;
        throw new Error(
          "Unexpected GitHub OAuth result: " + JSON.stringify(result),
        );
      }
    } catch (e) {
      if (e instanceof GitHubOAuthStateMismatchError) {
        return githubConnectError(res, "STATE_FAIL");
      } else if (e instanceof GitHubOAuthAccountMismatchError) {
        return githubConnectError(res, "DIFF_ACCOUNT");
      } else if (e instanceof OrgNotFoundError) {
        return githubConnectError(res, "ORG_FAIL");
      } else if (e instanceof InstallationNotFoundError) {
        // Thrown when newInstallationId doesn't exist on the organization in cases where it should
        return githubConnectError(res, "STATE_FAIL");
      } else if (e instanceof GitHubInstallationForbiddenError) {
        return githubConnectError(res, "INSTALLATION_FAIL");
      }
      throw e;
    }
  };

export function githubConnectError<ResMap extends ResponseMap>(
  res: Response,
  code:
    | "IDP_ERROR"
    | "STATE_FAIL"
    | "INSTALLATION_FAIL"
    | "DIFF_ACCOUNT"
    | "ORG_FAIL"
    | "",
): HandlerResponse<ResMap> {
  return redirect(302, res, `/error?type=github_app&code=${code}`);
}
