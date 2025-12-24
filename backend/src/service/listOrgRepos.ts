import { db } from "../db/index.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { OrgNotFoundError } from "./common/errors.ts";

export async function listOrgRepos(orgId: number, userId: number) {
  const org = await db.org.getById(orgId, {
    requireUser: { id: userId },
  });

  if (!org) {
    throw new OrgNotFoundError(null);
  }

  const gitProvider = await getGitProvider(org.id);
  const repos = await gitProvider.getAllRepos();

  return repos.map((repo) => ({
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
  }));
}
