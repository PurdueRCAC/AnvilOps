import type { OrganizationRepo } from "../db/repo/organization.ts";
import { env } from "../lib/env.ts";
import { logger } from "../logger.ts";
import {
  GitHubOAuthAccountMismatchError,
  GitHubOAuthStateMismatchError,
  ValidationError,
} from "./errors/index.ts";
import { type CreateGitHubAppInstallStateService } from "./githubAppInstall.ts";

export class GitHubInstallCallbackService {
  private orgRepo: OrganizationRepo;
  private appInstallService: CreateGitHubAppInstallStateService;

  constructor(
    orgRepo: OrganizationRepo,
    appInstallService: CreateGitHubAppInstallStateService,
  ) {
    this.orgRepo = orgRepo;
    this.appInstallService = appInstallService;
  }

  async createGitHubAuthorizationURL(
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
      const parsed = await this.appInstallService.verifyState(state);
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
      const newState = await this.appInstallService.createState(
        "GET_UID_FOR_LATER_INSTALLATION",
        stateUserId,
        orgId,
      );
      return `${env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${newState}`;
    }

    // Verify the user ID hasn't changed
    if (stateUserId !== userId) {
      throw new GitHubOAuthAccountMismatchError();
    }

    // Save the installation ID temporarily
    await this.orgRepo.setTemporaryInstallationId(
      orgId,
      stateUserId,
      installationId,
    );

    logger.info(
      { userId, orgId, installationId },
      "GitHub installation ID received (2/3)",
    );

    // Generate a new `state`
    const newState = await this.appInstallService.createState(
      "VERIFY_INSTALLATION_ACCESS",
      stateUserId,
      orgId,
    );

    return `${env.GITHUB_BASE_URL}/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&state=${newState}`;
  }
}
