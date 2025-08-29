import { RequestError } from "octokit";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const listRepoBranches: HandlerMap["listRepoBranches"] = async (
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

  if (!org) {
    return json(404, res, { code: 404, message: "Organization not found" });
  }

  if (org.githubInstallationId === null) {
    return json(403, res, { code: 403, message: "GitHub not connected" });
  }

  try {
    const octokit = await getOctokit(org.githubInstallationId);
    const repo = await getRepoById(octokit, ctx.request.params.repoId);
    const branches = await octokit.rest.repos.listBranches({
      owner: repo.owner.login,
      repo: repo.name,
    });

    return json(200, res, {
      default: repo.default_branch,
      branches: branches.data.map((branch) => branch.name),
    });
  } catch (e) {
    if (e instanceof RequestError && e.status == 404) {
      return json(404, res, { code: 404, message: "Repository not found" });
    }

    throw e;
  }
};
