import { randomBytes } from "node:crypto";
import { PermissionLevel } from "../generated/prisma/enums.ts";
import type { AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { env } from "../lib/env.ts";
import { json, redirect, type HandlerMap } from "../types.ts";
import { githubConnectError } from "./githubOAuthCallback.ts";

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
  const org = await db.organization.findUnique({
    where: {
      id: orgId,
      users: {
        some: {
          userId: req.user.id,
          permissionLevel: {
            in: [PermissionLevel.OWNER],
          },
        },
      },
      githubInstallationId: {
        equals: null,
      },
    },
  });

  if (org === null) {
    return json(404, res, {});
  }

  let state: string;
  try {
    state = await createState(req.user.id, orgId);
  } catch (e) {
    return githubConnectError(res, "STATE_FAIL");
  }

  return redirect(
    302,
    res,
    `${env.GITHUB_BASE_URL}/github-apps/${env.GITHUB_APP_NAME}/installations/new?state=${state}`,
  );

  // When GitHub redirects back, we handle it in githubInstallCallback.ts
};

export async function createState(userId: number, orgId: number) {
  const random = randomBytes(48).toString("base64url");

  const affectedUser = await db.user.update({
    where: { id: userId },
    data: { githubOAuthState: random },
  });

  if (affectedUser == null) {
    throw new Error("User not found");
  }

  return `${userId}.${orgId}.${random}`;
}

export async function verifyState(
  state: string,
): Promise<{ userId: number; orgId: number }> {
  const [userId, orgId, random] = state.split(".");

  const user = await db.user.update({
    where: {
      id: parseInt(userId),
      orgs: { some: { organizationId: parseInt(orgId) } },
      githubOAuthState: random,
    },
    data: {
      githubOAuthState: null, // Reset the user's OAuth state so that it can't be reused in subsequent requests
    },
  });

  if (user === null) {
    throw new Error("No matching user found");
  }

  return {
    userId: parseInt(userId),
    orgId: parseInt(orgId),
  };
}
