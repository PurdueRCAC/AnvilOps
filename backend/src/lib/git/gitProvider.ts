import { db } from "../../db/index.ts";
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in JSDoc comment
  type InstallationNotFoundError,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in JSDoc comment
  type RepositoryNotFoundError,
} from "../../service/common/errors.ts";
import { GitHubGitProvider } from "./githubGitProvider.ts";

/**
 * Contains all the methods needed to interact with a Git provider like GitHub or GitLab.
 */
export interface GitProvider {
  /** @throws {RepositoryNotFoundError} */
  getRepoById(repoId: number): Promise<GitRepository>;

  getRepoByName(owner: string, name: string): Promise<GitRepository>;

  /**
   * Generates a URL that includes a temporary access token which allows the Git
   * CLI to clone the repository without prompting for additional authentication.
   */
  generateCloneURL(repoId: number): Promise<string>;

  createCheckStatus(
    repoId: number,
    ref: string,
    status: CommitStatus,
    detailsURL: string,
  ): Promise<number>;

  updateCheckStatus(
    repoId: number,
    checkId: number,
    status: CommitStatus,
  ): Promise<void>;

  getCommitMessage(repoId: number, sha: string): Promise<string>;

  getLatestCommit(
    repoId: number,
    branch: string,
  ): Promise<{ sha: string; message: string }>;

  getWorkflows(repoId: number): Promise<GitCIWorkflow[]>;

  getBranches(
    repoId: number,
  ): Promise<{ defaultBranch: string; names: string[] }>;

  getAllRepos(): Promise<GitRepository[]>;

  getInstallationInfo(): Promise<{
    /** Whether this installation can access every repository on its target or only a subset */
    hasAllRepoAccess: boolean;
    targetId: number;
    targetType: "User" | "Organization";
    targetName: string;
  }>;
  /**
   * Requests that a repository hosted at sourceURL be copied into a new repository
   * under the specified owner and name. If the user needs to perform a manual auth step,
   * an ImportRepoAuthenticationRequiredError will be thrown with the URL the user needs
   * to be redirected to.
   */
  importRepo(
    userId: number,
    orgId: number,
    sourceURL: URL,
    newOwner: string,
    newRepoName: string,
    makePrivate: boolean,
  ): Promise<number>;

  /**
   * This function should be called after the user is redirected to an external service to
   * perform an auth step and the service redirects back to AnvilOps.
   *
   * Implementations will parse information like OAuth codes from the URL and use it to
   * finish importing the repository.
   */
  continueImportRepo(
    stateId: string,
    code: string,
    userId: number,
  ): Promise<{ repoId: number; orgId: number; repoName: string }>;

  /**
   * Returns the name and email that AnvilOps should use to push the initial commit when copying
   * a repository manually (cloning, erasing history, and pushing a new initial commit).
   */
  getBotCommitterDetails(): Promise<{ name: string; email: string }>;
}

export interface GitCIWorkflow {
  id: number;
  /** A user-friendly name for the workflow */
  name: string;
  /** A file path of the configuration file that defines this workflow */
  path: string;
}

export interface GitRepository {
  id: number;
  owner: string;
  name: string;
  htmlURL: string;
}

export type CommitStatus =
  | "queued"
  | "in_progress"
  | "success"
  | "failure"
  | "cancelled";

/**
 * Thrown when a repository can be imported, but the user needs to perform some authentication or authorization step first.
 * The user will be redirected to the provided URL. When the external service redirects back to AnvilOps, continueImportRepo
 * will be called with the callback URL.
 */
export class ImportRepoAuthenticationRequiredError extends Error {
  redirectURL: string;

  constructor(url: string, opts?: ErrorOptions) {
    super(null, opts);
    this.redirectURL = url;
  }
}

/**
 * Returns a GitProvider based on the organization that it's linked to.
 *
 * If the organization is not linked to a Git provider, an {@link InstallationNotFoundError} is thrown.
 */
export async function getGitProvider(orgId: number): Promise<GitProvider> {
  return await GitHubGitProvider.getInstance(orgId);
}

/**
 * Returns a GitProvider based on the contents of a repository import state ID.
 */
export async function getGitProviderByRepoImportState(
  stateId: string,
  userId: number,
): Promise<GitProvider> {
  // In the future, if multiple Git providers are added, repository imports may be handled differently
  // by different providers, which may require separate database tables depending on the information
  // that needs to be stored by each provider. In that case, this method should be updated to check all
  // the different sources of import state IDs and return a provider of the appropriate type.

  const state = await db.repoImportState.get(stateId, userId);
  return await getGitProvider(state.orgId);
}

type GitProviderType = "github" | null;

/**
 * Returns the type of Git provider that is connected to this organization, or null if the organization is not connected to Git.
 */
export async function getGitProviderType(
  orgId: number,
): Promise<GitProviderType> {
  const org = await db.org.getById(orgId);
  if (org.githubInstallationId) {
    return "github";
  }
  return null;
}
