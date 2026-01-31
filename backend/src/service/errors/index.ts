export class UserNotFoundError extends Error {}
export class AppNotFoundError extends Error {}
export class RepositoryNotFoundError extends Error {}

export class InstallationNotFoundError extends Error {
  constructor(cause: Error) {
    super(undefined, { cause: cause });
  }
}

export class OrgNotFoundError extends Error {
  constructor(cause: Error) {
    super(undefined, { cause: cause });
  }
}

export class InvitationNotFoundError extends Error {
  constructor(cause: Error) {
    super(undefined, { cause: cause });
  }
}

export class DeploymentNotFoundError extends Error {}

export class ValidationError extends Error {}

export class DeploymentError extends Error {
  constructor(cause: Error) {
    super(undefined, { cause: cause });
  }
}

export class AppCreateError extends Error {
  appName: string;

  constructor(appName: string, cause: Error) {
    super(appName, cause);
    this.appName = appName;
  }
}

/**
 * Thrown when trying to use the file browser to mount a PVC
 * that doesn't belong to the requested application.
 */
export class IllegalPVCAccessError extends Error {}

/**
 * Thrown when an organization is already linked to GitHub
 * and a user tries to install the GitHub App again.
 */
export class OrgAlreadyLinkedError extends Error {}

export class GitHubOAuthStateCreationError extends Error {}

/**
 * Thrown when the account used to install the GitHub App
 * differs from the one authenticated in the follow-up request.
 */
export class GitHubOAuthAccountMismatchError extends Error {}

/**
 * Thrown when there's something wrong or unexpected with the
 * given OAuth `state` parameter.
 */
export class GitHubOAuthStateMismatchError extends Error {}

/**
 * Thrown when a user tries to link an AnvilOps organization with
 * a GitHub App installation that they didn't create.
 */
export class GitHubInstallationForbiddenError extends Error {}

/**
 * Thrown when a webhook payload doesn't match any of the expected
 * actions or events. Should trigger a "Bad request" (4xx) HTTP error.
 */
export class UnknownWebhookRequestTypeError extends Error {}
