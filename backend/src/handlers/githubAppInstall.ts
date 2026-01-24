import { logger } from "../index.ts";
import { env } from "../lib/env.ts";
import {
  OrgAlreadyLinkedError,
  OrgNotFoundError,
} from "../service/common/errors.ts";
import { createGitHubAppInstallState } from "../service/githubAppInstall.ts";
import { json, redirect, type HandlerMap } from "../types.ts";
import { githubConnectError } from "./githubOAuthCallback.ts";
import type { AuthenticatedRequest } from "./index.ts";

/**
 * GitHub App installation & user authorization process:
 *
 * 1. We redirect to {GHES URL}/github_apps/{appName}/installations/new?state={userId+orgId+random} [operation ID: githubAppInstall]
 * 2. GitHub redirects back to /github/installation-callback?state={userId+orgId+random} [operation ID: githubInstallCallback]
 * 3. We validate the state and save the installation ID in a temporary field. We haven't validated it yet, so it's not marked as the org's installation ID yet!
 * 4. We redirect to {GHES URL}/login/oauth/authorize?client_id={clientId}&state={userId+orgId+installationId+random}
 * 5. GitHub redirects back to /oauth2/github/callback?state={userId+orgId+installationId+random} [operation ID: githubOAuthCallback]
 * 6. We validate the state, verify that the user has access to the installation ID that they just gave to us in Step 2, and set it as the org's installation ID.
 *    Done! The user access token is no longer necessary, so we don't need to save it.
 *
 * More info: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#generating-a-user-access-token-when-a-user-installs-your-app
 *
 * This endpoint handles step 1 of the process.
 */
export const githubAppInstallHandler: HandlerMap["githubAppInstall"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    const newState = await createGitHubAppInstallState(
      ctx.request.params.orgId,
      req.user.id,
    );

    return redirect(
      302,
      res,
      `${env.GITHUB_BASE_URL}/github-apps/${env.GITHUB_APP_NAME}/installations/new?state=${newState}`,
    );

    // When GitHub redirects back, we handle it in githubInstallCallback.ts
  } catch (e) {
    if (e instanceof OrgAlreadyLinkedError) {
      json(400, res, {
        code: 400,
        message: "This organization is already linked to GitHub.",
      });
    } else if (e instanceof OrgNotFoundError) {
      return json(404, res, { code: 404, message: "Organization not found." });
    } else {
      logger.error(e, "Error creating GitHub OAuth state");
      return githubConnectError(res, "STATE_FAIL");
    }
  }
};
