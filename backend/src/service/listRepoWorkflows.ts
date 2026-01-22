import { RequestError } from "octokit";
import { db } from "../db/index.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { OrgNotFoundError, RepositoryNotFoundError } from "./common/errors.ts";

export async function listRepoWorkflows(
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
    const workflows = await gitProvider.getWorkflows(repoId);
    return workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      path: workflow.path,
    }));
  } catch (e) {
    if (e instanceof RequestError && e.status === 404) {
      throw new RepositoryNotFoundError();
    }

    throw e;
  }
}
