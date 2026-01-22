import { RequestError } from "octokit";
import { db } from "../db/index.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { OrgNotFoundError, RepositoryNotFoundError } from "./common/errors.ts";

export async function listRepoBranches(
  orgId: number,
  userId: number,
  repoId: number,
) {
  const org = await db.org.getById(orgId, {
    requireUser: { id: userId },
  });

  if (!org) {
    throw new OrgNotFoundError(null);
  }

  try {
    const gitProvider = await getGitProvider(org.id);
    const branches = await gitProvider.getBranches(repoId);

    return {
      default: branches.defaultBranch,
      branches: branches.names,
    };
  } catch (e) {
    if (e instanceof RequestError && e.status == 404) {
      throw new RepositoryNotFoundError();
    }

    throw e;
  }
}
