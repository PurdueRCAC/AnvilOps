import { RequestError } from "octokit";
import { db } from "../db/index.ts";
import { getOctokit } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const listRepoWorkflows: HandlerMap["listRepoWorkflows"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const org = await db.org.getById(ctx.request.params.orgId, {
    requireUser: { id: req.user.id },
  });

  if (!org) {
    return json(404, res, { code: 404, message: "Organization not found" });
  }

  if (org.githubInstallationId == null) {
    return json(403, res, { code: 403, message: "GitHub not connected" });
  }
  try {
    const octokit = await getOctokit(org.githubInstallationId);
    const workflows = (await octokit
      .request({
        method: "GET",
        url: `/repositories/${ctx.request.params.repoId}/actions/workflows`,
      })
      .then((res) => res.data.workflows)) as Awaited<
      ReturnType<typeof octokit.rest.actions.getWorkflow>
    >["data"][];
    return json(200, res, {
      workflows: workflows.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        path: workflow.path,
      })),
    });
  } catch (e) {
    if (e instanceof RequestError && e.status === 404) {
      return json(404, res, { code: 404, message: "Repository not found" });
    }

    throw e;
  }
};
