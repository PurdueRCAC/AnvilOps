import { db } from "../db/index.ts";
import {
  PermissionLevel,
  type GitHubOAuthAction,
} from "../generated/prisma/enums.ts";
import { GitHubGitProvider } from "../lib/git/githubGitProvider.ts";
import {
  GitHubInstallationForbiddenError,
  GitHubOAuthAccountMismatchError,
  GitHubOAuthStateMismatchError,
  InstallationNotFoundError,
  OrgNotFoundError,
} from "./common/errors.ts";
import { verifyState } from "./githubAppInstall.ts";

type GitHubOAuthResponseResult = "done" | "approval-needed";

export async function processGitHubOAuthResponse(
  state: string,
  code: string,
  reqUserId: number,
): Promise<GitHubOAuthResponseResult> {
  // Verify the `state` and extract the user and org IDs
  let action: GitHubOAuthAction, userId: number, orgId: number;
  try {
    const parsed = await verifyState(state);
    action = parsed.action;
    userId = parsed.userId;
    orgId = parsed.orgId;
  } catch (e) {
    throw new GitHubOAuthStateMismatchError();
  }

  // Verify that the user ID hasn't changed
  if (userId !== reqUserId) {
    throw new GitHubOAuthAccountMismatchError();
  }

  // Verify that the user has access to the installation
  if (action === "VERIFY_INSTALLATION_ACCESS") {
    const org = await db.org.getById(orgId, {
      requireUser: { id: userId, permissionLevel: PermissionLevel.OWNER },
    });

    if (!org) {
      throw new OrgNotFoundError(null);
    }

    if (!org?.newInstallationId) {
      throw new InstallationNotFoundError(null);
    }

    const canAccess = GitHubGitProvider.userCanAccessInstallation(
      code,
      org.newInstallationId,
    );

    if (!canAccess) {
      // The user doesn't have access to the new installation
      throw new GitHubInstallationForbiddenError();
    }

    // Update the organization's installation ID
    await db.org.setInstallationId(orgId, org.newInstallationId);

    // We're finally done! Redirect the user back to the frontend.
    return "done";
  } else if (state === "GET_UID_FOR_LATER_INSTALLATION") {
    const userId = await GitHubGitProvider.getUserFromOAuthCode(code);

    await db.user.setGitHubUserId(userId, userId);

    // Redirect the user to a page that says the app approval is pending and that they can link the installation to an organization when the request is approved.
    return "approval-needed";
  } else {
    throw new GitHubOAuthStateMismatchError();
  }
}
