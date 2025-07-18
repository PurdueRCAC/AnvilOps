import { PermissionLevel } from "../generated/prisma/enums.ts";
import type { AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { getUserOctokit } from "../lib/octokit.ts";
import { json, redirect, type HandlerMap } from "../types.ts";
import { verifyState } from "./githubAppInstall.ts";

/**
 * This endpoint is called after the user signs in with GitHub.
 *
 * After they install the app, we need to verify that the installation ID they provide us is theirs.
 * To do this, we redirect BACK to GitHub, get authorization, and then look up their installed apps.
 *
 * In this handler, we perform that verification and then redirect back to the frontend.
 */
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
    return json(500, res, { code: 500, message: "Failed to verify `state`" });
  }

  // 2) Verify that the user ID hasn't changed
  if (userId !== req.user.id) {
    return json(401, res, {
      code: 401,
      message:
        "You signed in to a different account while connecting your GitHub account!",
    });
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
    return json(404, res, {
      code: 404,
      message: "Organization not found",
    });
  }

  if (!org?.newInstallationId) {
    return json(500, res, {
      code: 500,
      message: "Failed to look up Installation ID",
    });
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
    return json(403, res, {
      code: 403,
      message: "You do not have access to that GitHub App installation.",
    });
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
