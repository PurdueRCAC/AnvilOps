import { RequestError } from "octokit";
import { db } from "../db/index.ts";
import { getOctokit } from "../lib/octokit.ts";
import {
  InstallationNotFoundError,
  OrgNotFoundError,
  RepositoryNotFoundError,
} from "./common/errors.ts";

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

  if (org.githubInstallationId == null) {
    throw new InstallationNotFoundError(null);
  }

  try {
    const octokit = await getOctokit(org.githubInstallationId);
    const workflows = (await octokit
      .request({
        method: "GET",
        url: `/repositories/${repoId}/actions/workflows`,
      })
      .then((res) => res.data.workflows)) as Awaited<
      ReturnType<typeof octokit.rest.actions.getWorkflow>
    >["data"][];
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
