import { db } from "../db/index.ts";
import { env } from "../lib/env.ts";
import { json, redirect, type HandlerMap } from "../types.ts";
import { createState, verifyState } from "./githubAppInstall.ts";
import { githubConnectError } from "./githubOAuthCallback.ts";
import type { AuthenticatedRequest } from "./index.ts";

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

    if (
      !installationId &&
      (ctx.request.query.setup_action === "install" ||
        ctx.request.query.setup_action === "update")
    ) {
      return json(400, res, { code: 400, message: "Missing installation ID." });
    }

    // 1) Verify the `state`
    let userId: number, orgId: number;
    try {
      const parsed = await verifyState(state);
      userId = parsed.userId;
      orgId = parsed.orgId;

      if (parsed.action !== "CREATE_INSTALLATION") {
        return githubConnectError(res, "STATE_FAIL");
      }
    } catch (e) {
      return githubConnectError(res, "STATE_FAIL");
    }

    // 1.5) Make sure the app was actually installed
    if (ctx.request.query.setup_action === "request") {
      // The user sent a request to an admin to approve their installation.
      // We have to bail early here because we don't have the installation ID yet. It will come in through a webhook when the request is approved.
      // Next, we'll get the user's GitHub user ID and save it for later so that we can associate the new installation with them.
      const newState = await createState(
        "GET_UID_FOR_LATER_INSTALLATION",
        userId,
        orgId,
      );
      return redirect(
        302,
        res,
        `${env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${newState}`,
      );
    }

    // 2) Verify the user ID hasn't changed
    if (userId !== req.user.id) {
      return githubConnectError(res, "DIFF_ACCOUNT");
    }

    // 3) Save the installation ID temporarily
    await db.org.setTemporaryInstallationId(orgId, userId, installationId);

    // 4) Generate a new `state`
    const newState = await createState(
      "VERIFY_INSTALLATION_ACCESS",
      userId,
      orgId,
    );

    // 5) Redirect back to GitHub to get a user access token
    return redirect(
      302,
      res,
      `${env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${newState}`,
    );

    // When GitHub redirects back, we handle it in githubOAuthCallback.ts
  };
