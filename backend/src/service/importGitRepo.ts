import { db, NotFoundError } from "../db/index.ts";
import { logger } from "../index.ts";
import { getLocalRepo, importRepo } from "../lib/import.ts";
import { getOctokit } from "../lib/octokit.ts";
import {
  InstallationNotFoundError,
  OrgNotFoundError,
} from "./common/errors.ts";

export async function createRepoImportState(
  orgId: number,
  userId: number,
  {
    sourceURL,
    destOwner,
    destIsOrg,
    destRepo,
    makePrivate,
  }: {
    sourceURL: string;
    destOwner: string;
    destIsOrg: boolean;
    destRepo: string;
    makePrivate: boolean;
  },
): Promise<
  | { codeNeeded: true; oauthState: string }
  | { codeNeeded: false; orgId: number; repoId: number }
> {
  const org = await db.org.getById(orgId, {
    requireUser: { id: userId, permissionLevel: "OWNER" },
  });

  if (!org) {
    throw new OrgNotFoundError(null);
  }

  if (!org.githubInstallationId) {
    throw new InstallationNotFoundError(null);
  }

  const stateId = await db.repoImportState.create(
    userId,
    org.id,
    destIsOrg,
    destOwner,
    destRepo,
    makePrivate,
    sourceURL,
  );

  const octokit = await getOctokit(org.githubInstallationId);
  const isLocalRepo = !!(await getLocalRepo(octokit, URL.parse(sourceURL)));

  if (destIsOrg || isLocalRepo) {
    // We can create the repo now
    // Fall into the importGitRepo handler directly
    return await importGitRepo(stateId, undefined, userId);
  } else {
    // We need a user access token
    return {
      codeNeeded: true as const,
      oauthState: stateId,
    };
  }
}

export async function importGitRepo(
  stateId: string,
  code: string | undefined,
  userId: number,
): Promise<
  | { codeNeeded: true; oauthState: string }
  | { codeNeeded: false; orgId: number; repoId: number }
> {
  const state = await db.repoImportState.get(stateId, userId);

  if (!state) {
    throw new NotFoundError("repoImportState");
  }

  logger.info(
    {
      source: state.srcRepoURL,
      destOwner: state.destRepoOwner,
      destRepo: state.destRepoName,
      makePrivate: state.makePrivate,
    },
    "Importing Git repository",
  );

  const org = await db.org.getById(state.orgId);

  const repoId = await importRepo(
    org.githubInstallationId,
    URL.parse(state.srcRepoURL),
    state.destIsOrg,
    state.destRepoOwner,
    state.destRepoName,
    state.makePrivate,
    code,
  );

  if (repoId === "code needed") {
    // There was a problem creating the repo directly from a template and we didn't provide an OAuth code to authorize the user.
    // We need to start over.
    return {
      codeNeeded: true,
      oauthState: state.id,
    };
  }

  await db.repoImportState.delete(state.id);

  // The repository was created successfully. If repoId is null, then
  // we're not 100% sure that it was created, but no errors were thrown.
  // It's probably just a big repository that will be created soon.

  return {
    codeNeeded: false,
    orgId: state.orgId,
    repoId,
  };
}
