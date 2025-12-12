import { db } from "../db/index.ts";
import { getOctokit } from "../lib/octokit.ts";
import {
  InstallationNotFoundError,
  OrgNotFoundError,
} from "./common/errors.ts";

export async function listOrgRepos(orgId: number, userId: number) {
  const org = await db.org.getById(orgId, {
    requireUser: { id: userId },
  });

  if (!org) {
    throw new OrgNotFoundError(null);
  }

  if (org.githubInstallationId === null) {
    throw new InstallationNotFoundError(null);
  }

  const octokit = await getOctokit(org.githubInstallationId);
  const repos = await octokit.rest.apps.listReposAccessibleToInstallation();

  return repos.data.repositories?.map((repo) => ({
    id: repo.id,
    owner: repo.owner.login,
    name: repo.name,
  }));
}
