import type { Response } from "express";
import {
  PermissionLevel,
  type GitHubOAuthAction,
} from "../generated/prisma/enums.ts";
import { db } from "../lib/db.ts";
import { getUserOctokit } from "../lib/octokit.ts";
import { redirect, type HandlerMap } from "../types.ts";
import { verifyState } from "./githubAppInstall.ts";
import type { AuthenticatedRequest } from "./index.ts";
/**
 * This endpoint is called after the user signs in with GitHub.
 *
 * After they install the app, we need to verify that the installation ID they provide us is theirs.
 * To do this, we redirect BACK to GitHub, get authorization, and then look up their installed apps.
 *
 * In this handler, we perform that verification and then redirect back to the frontend.
 */

export const githubConnectError = (
  res: Response,
  code:
    | "IDP_ERROR"
    | "STATE_FAIL"
    | "INSTALLATION_FAIL"
    | "DIFF_ACCOUNT"
    | "ORG_FAIL"
    | "",
) => {
  return redirect(302, res, `/error?type=github_app&code=${code}`);
};

export const githubOAuthCallback: HandlerMap["githubOAuthCallback"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const state = ctx.request.query.state;
  const code = ctx.request.query.code;

  // 1) Verify the `state` and extract the user and org IDs
  let action: GitHubOAuthAction, userId: number, orgId: number;
  try {
    const parsed = await verifyState(state);
    action = parsed.action;
    userId = parsed.userId;
    orgId = parsed.orgId;
  } catch (e) {
    return githubConnectError(res, "STATE_FAIL");
  }

  // 2) Verify that the user ID hasn't changed
  if (userId !== req.user.id) {
    return githubConnectError(res, "DIFF_ACCOUNT");
  }

  // 3) Verify that the user has access to the installation
  if (action === "VERIFY_INSTALLATION_ACCESS") {
    const octokit = getUserOctokit(code);

    const org = await db.organization.findFirst({
      select: { id: true, newInstallationId: true },
      where: {
        id: orgId,
        users: {
          some: {
            userId: userId,
            permissionLevel: { in: [PermissionLevel.OWNER] },
          },
        },
      },
    });

    if (!org) {
      return githubConnectError(res, "ORG_FAIL");
    }

    if (!org?.newInstallationId) {
      return githubConnectError(res, "");
    }

    const installations = (
      await octokit.rest.apps.listInstallationsForAuthenticatedUser()
    ).data.installations;
    let found = false;
    for (const install of installations) {
      if (install.id === org.newInstallationId) {
        found = true;
        break;
      }
    }

    if (!found) {
      // The user doesn't have access to the new installation
      return githubConnectError(res, "INSTALLATION_FAIL");
    }

    // Update the organization's installation ID
    await db.organization.update({
      where: { id: orgId },
      data: {
        newInstallationId: null,
        githubInstallationId: org.newInstallationId,
      },
    });

    // We're finally done! Redirect the user back to the frontend.
    return redirect(302, res, "/dashboard");
  } else if (state === "GET_UID_FOR_LATER_INSTALLATION") {
    const octokit = getUserOctokit(code);
    const user = await octokit.rest.users.getAuthenticated();
    await db.user.updateMany({
      // Remove the association to this GitHub user ID for any other AnvilOps users - this is OK to do because we're only using the user ID as a way to temporarily
      // link the installation webhook payloads to the AnvilOps user account. If a user creates multiple AnvilOps accounts and signs in with GitHub on all of them,
      // it's fine that the installation request is only associated with their most recently connected account.
      where: { githubUserId: user.data.id, id: { not: userId } },
      data: { githubUserId: null },
    });
    await db.user.update({
      where: { id: userId },
      data: { githubUserId: user.data.id },
    });

    // Redirect the user to a page that says the app approval is pending and that they can link the installation to an organization when the request is approved.
    return redirect(302, res, "/github-approval-pending");
  } else {
    return githubConnectError(res, "STATE_FAIL");
  }
};
