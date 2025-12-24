import { db } from "../db/index.ts";
import {
  getGitProvider,
  getGitProviderByRepoImportState,
  ImportRepoAuthenticationRequiredError,
} from "../lib/git/gitProvider.ts";
import { OrgNotFoundError } from "./common/errors.ts";

/**
 * Imports a Git repository, or returns a redirect URL if authorization is needed.
 */
export async function importGitRepo(
  orgId: number,
  userId: number,
  {
    sourceURL,
    destOwner,
    destRepo,
    makePrivate,
  }: {
    sourceURL: string;
    destOwner: string;
    destRepo: string;
    makePrivate: boolean;
  },
): Promise<
  | { codeNeeded: true; url: string }
  | { codeNeeded: false; orgId: number; repoId: number }
> {
  const org = await db.org.getById(orgId, {
    requireUser: { id: userId, permissionLevel: "OWNER" },
  });

  if (!org) {
    throw new OrgNotFoundError(null);
  }

  const gitProvider = await getGitProvider(org.id);
  try {
    return {
      codeNeeded: false,
      orgId: orgId,
      repoId: await gitProvider.importRepo(
        userId,
        orgId,
        new URL(sourceURL),
        destOwner,
        destRepo,
        makePrivate,
      ),
    };
  } catch (e) {
    if (e instanceof ImportRepoAuthenticationRequiredError) {
      return {
        codeNeeded: true,
        url: e.redirectURL,
      };
    } else {
      throw e;
    }
  }
}

/**
 * If authorization was needed when {@link importGitRepo} was called, after the external service redirects back
 * to AnvilOps, continueImportGitRepo should be called to use the credentials to import the repository.
 */
export async function continueImportGitRepo(
  stateId: string,
  code: string,
  userId: number,
): Promise<{ orgId: number; repoId: number }> {
  const gitProvider = await getGitProviderByRepoImportState(stateId, userId);

  const { repoId, orgId } = await gitProvider.continueImportRepo(
    stateId,
    code,
    userId,
  );

  return { orgId, repoId };
}
