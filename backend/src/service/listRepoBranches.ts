import { RequestError } from "octokit";
import { db } from "../db/index.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import {
  InstallationNotFoundError,
  OrgNotFoundError,
  RepositoryNotFoundError,
} from "./common/errors.ts";

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

  if (org.githubInstallationId === null) {
    throw new InstallationNotFoundError(null);
  }

  try {
    const octokit = await getOctokit(org.githubInstallationId);
    const repo = await getRepoById(octokit, repoId);
    const branches = await octokit.rest.repos.listBranches({
      owner: repo.owner.login,
      repo: repo.name,
    });

    if (branches.data.length === 0) {
      throw new RepositoryNotFoundError();
    }

    return {
      default: repo.default_branch,
      branches: branches.data.map((branch) => branch.name),
    };
  } catch (e) {
    if (e instanceof RequestError && e.status == 404) {
      throw new RepositoryNotFoundError();
    }

    throw e;
  }
}
