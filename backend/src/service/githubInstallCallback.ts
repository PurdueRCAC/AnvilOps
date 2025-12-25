import { db } from "../db/index.ts";
import {
  GitHubOAuthAccountMismatchError,
  GitHubOAuthStateMismatchError,
  ValidationError,
} from "./common/errors.ts";
import { createState, verifyState } from "./githubAppInstall.ts";

export async function createGitHubAuthorizationState(
  state: string,
  installationId: number,
  setupAction: "request" | "install" | "update",
  userId: number,
) {
  if (
    !installationId &&
    (setupAction === "install" || setupAction === "update")
  ) {
    throw new ValidationError("Missing installation ID.");
  }

  // Verify the `state`
  let stateUserId: number, orgId: number;
  try {
    const parsed = await verifyState(state);
    stateUserId = parsed.userId;
    orgId = parsed.orgId;

    if (parsed.action !== "CREATE_INSTALLATION") {
      throw new GitHubOAuthStateMismatchError();
    }
  } catch (e) {
    throw new GitHubOAuthStateMismatchError(null, { cause: e });
  }

  // Make sure the app was actually installed
  if (setupAction === "request") {
    // The user sent a request to an admin to approve their installation.
    // We have to bail early here because we don't have the installation ID yet. It will come in through a webhook when the request is approved.
    // Next, we'll get the user's GitHub user ID and save it for later so that we can associate the new installation with them.
    const newState = await createState(
      "GET_UID_FOR_LATER_INSTALLATION",
      stateUserId,
      orgId,
    );
    return newState;
  }

  // Verify the user ID hasn't changed
  if (stateUserId !== userId) {
    throw new GitHubOAuthAccountMismatchError();
  }

  // Save the installation ID temporarily
  await db.org.setTemporaryInstallationId(orgId, stateUserId, installationId);

  // Generate a new `state`
  const newState = await createState(
    "VERIFY_INSTALLATION_ACCESS",
    stateUserId,
    orgId,
  );

  return newState;
}
