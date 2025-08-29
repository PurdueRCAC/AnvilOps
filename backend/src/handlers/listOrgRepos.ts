import { db } from "../lib/db.ts";
import { getOctokit } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const listOrgRepos: HandlerMap["listOrgRepos"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const org = await db.organization.findUnique({
    where: {
      id: ctx.request.params.orgId,
      users: { some: { userId: req.user.id } },
    },
    select: { githubInstallationId: true },
  });

  if (!org) {
    return json(404, res, { code: 404, message: "Organization not found." });
  }

  if (org.githubInstallationId === null) {
    return json(403, res, { code: 403, message: "GitHub not connected" });
  }

  const octokit = await getOctokit(org.githubInstallationId);
  const repos = await octokit.rest.apps.listReposAccessibleToInstallation();

  const data = repos.data.repositories?.map((repo) => ({
    id: repo.id,
    owner: repo.owner.login,
    name: repo.name,
  }));

  return json(200, res, data);
};
