import type { AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { getOctokit } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";

export const getInstallation: HandlerMap["getInstallation"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const org = await db.organization.findFirst({
    where: {
      id: ctx.request.params.orgId,
      users: {
        some: {
          userId: req.user.id,
        },
      },
    },
  });

  if (!org || !org.githubInstallationId) {
    return json(404, res, {});
  }

  const octokit = await getOctokit(org.githubInstallationId);
  const installation = await octokit.rest.apps.getInstallation({
    installation_id: org.githubInstallationId,
  });

  return json(200, res, {
    hasAllRepoAccess: installation.data.repository_selection === "all",
    targetId: installation.data.target_id,
    targetType: installation.data.target_type as "User" | "Organization",
    targetName:
      // `slug` is present when `account` is an Organization, and `login` is present when it's a User
      "slug" in installation.data.account
        ? installation.data.account.slug
        : installation.data.account.login,
  });
};
