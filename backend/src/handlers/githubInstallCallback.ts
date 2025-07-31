import { PermissionLevel } from "../generated/prisma/enums.ts";
import type { AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { env } from "../lib/env.ts";
import { json, redirect, type HandlerMap } from "../types.ts";
import { createState, verifyState } from "./githubAppInstall.ts";

/**
 * This endpoint is called after the user installs the GitHub App on their user account or organization.
 * The URL of this endpoint should be used as the GitHub App's "Setup URL".
 *
 * We (1-2) validate the `state`, (3) save the installation ID in a temporary location, and then (4-5) redirect back to GitHub to authorize.
 * After that, we will use the authorization to verify that the user has access to the installation ID that they provided, and then
 * the installation ID can be linked to the organization and the user access token can be discarded.
 */
export const githubInstallCallback: HandlerMap["githubInstallCallback"] =
  async (ctx, req: AuthenticatedRequest, res) => {
    const state = ctx.request.query.state;
    const installationId = ctx.request.query.installation_id;

    // 1) Verify the `state`
    let userId: number, orgId: number;
    try {
      const parsed = await verifyState(state);
      userId = parsed.userId;
      orgId = parsed.orgId;
    } catch (e) {
      return json(500, res, {
        code: 500,
        message: "Failed to verify `state`",
      });
    }

    // 2) Verify the user ID hasn't changed
    if (userId !== req.user.id) {
      return json(401, res, {
        code: 500,
        message:
          "You signed in to a different account while connecting your GitHub account!",
      });
    }

    // 3) Save the installation ID temporarily
    const org = await db.organization.update({
      where: {
        id: orgId,
        users: {
          some: {
            userId: userId,
            permissionLevel: { in: [PermissionLevel.OWNER] },
          },
        },
      },
      data: { newInstallationId: installationId },
    });

    if (org === null) {
      return json(500, res, {
        code: 500,
        message: "Couldn't find the requested organization",
      });
    }

    // 4) Generate a new `state`
    const newState = await createState(userId, orgId);

    // 5) Redirect back to GitHub to get a user access token
    return redirect(
      302,
      res,
      `${env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${newState}`,
    );

    // When GitHub redirects back, we handle it in githubOAuthCallback.ts
  };
