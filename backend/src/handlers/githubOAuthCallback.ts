import { PermissionLevel } from "../generated/prisma/enums.ts";
import type { AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { getUserOctokit } from "../lib/octokit.ts";
import { json, redirect, type HandlerMap } from "../types.ts";
import { verifyState } from "./githubAppInstall.ts";
import type { Response } from "express";
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
  let userId: number, orgId: number;
  try {
    const parsed = await verifyState(state);
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
};
