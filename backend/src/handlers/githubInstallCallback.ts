import { env } from "../lib/env.ts";
import {
  GitHubOAuthAccountMismatchError,
  GitHubOAuthStateMismatchError,
  ValidationError,
} from "../service/common/errors.ts";
import { createGitHubAuthorizationState } from "../service/githubInstallCallback.ts";
import { json, redirect, type HandlerMap } from "../types.ts";
import { githubConnectError } from "./githubOAuthCallback.ts";
import type { AuthenticatedRequest } from "./index.ts";

/**
 * This endpoint is called after the user installs the GitHub App on their user account or organization.
 * The URL of this endpoint should be used as the GitHub App's "Setup URL".
 *
 * We validate the `state`, save the installation ID in a temporary location, and then redirect back to GitHub to authorize.
 * After that, we will use the authorization to verify that the user has access to the installation ID that they provided, and then
 * the installation ID can be linked to the organization and the user access token can be discarded.
 */
export const githubInstallCallbackHandler: HandlerMap["githubInstallCallback"] =
  async (ctx, req: AuthenticatedRequest, res) => {
    try {
      const newState = await createGitHubAuthorizationState(
        ctx.request.query.state,
        ctx.request.query.installation_id,
        ctx.request.query.setup_action,
        req.user.id,
      );

      // Redirect back to GitHub to get a user access token
      return redirect(
        302,
        res,
        `${env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${newState}`,
      );

      // When GitHub redirects back, we handle it in githubOAuthCallback.ts
    } catch (e) {
      if (e instanceof ValidationError) {
        return json(400, res, { code: 400, message: e.message });
      } else if (e instanceof GitHubOAuthAccountMismatchError) {
        return githubConnectError(res, "DIFF_ACCOUNT");
      } else if (e instanceof GitHubOAuthStateMismatchError) {
        return githubConnectError(res, "STATE_FAIL");
      }
      throw e;
    }
  };
