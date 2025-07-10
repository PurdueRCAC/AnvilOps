import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { getOctokit } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";

export const listRepoWorkflows: HandlerMap["listRepoWorkflows"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const org = await db.organization.findFirst({
    where: {
      id: ctx.request.params.orgId,
      users: { some: { userId: req.user.id } },
    },
    select: { githubInstallationId: true },
  });

  const octokit = await getOctokit(org.githubInstallationId);
  const workflows = await octokit
    .request({
      method: "GET",
      url: `/repositories/${ctx.request.params.repoId}/actions/workflows`,
    })
    .then((res) => res.data.workflows);
  return json(200, res, {
    workflows: workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      url: workflow.html_url,
    })),
  });
};
