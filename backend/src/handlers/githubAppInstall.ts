import { randomBytes } from "node:crypto";
import { db } from "../db/index.ts";
import type { GitHubOAuthState } from "../generated/prisma/client.ts";
import {
  PermissionLevel,
  type GitHubOAuthAction,
} from "../generated/prisma/enums.ts";
import { env } from "../lib/env.ts";
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
export const githubAppInstall: HandlerMap["githubAppInstall"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const orgId = ctx.request.params.orgId;

  const org = await db.org.getById(orgId, {
    requireUser: { id: req.user.id, permissionLevel: PermissionLevel.OWNER },
  });

  if (org.githubInstallationId) {
    return json(400, res, {
      code: 400,
      message: "This organization is already linked to GitHub.",
    });
  }

  if (org === null) {
    return json(404, res, { code: 404, message: "Organization not found." });
  }

  let state: string;
  try {
    state = await createState("CREATE_INSTALLATION", req.user.id, orgId);
  } catch (e) {
    console.error("Error creating state", e);
    return githubConnectError(res, "STATE_FAIL");
  }

  return redirect(
    302,
    res,
    `${env.GITHUB_BASE_URL}/github-apps/${env.GITHUB_APP_NAME}/installations/new?state=${state}`,
  );

  // When GitHub redirects back, we handle it in githubInstallCallback.ts
};

export async function createState(
  action: GitHubOAuthAction,
  userId: number,
  orgId: number,
) {
  const random = randomBytes(64).toString("base64url");
  await db.user.setOAuthState(orgId, userId, action, random);
  return random;
}

export async function verifyState(random: string): Promise<GitHubOAuthState> {
  return await db.user.getAndDeleteOAuthState(random);
}
