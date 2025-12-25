import { db } from "../db/index.ts";
import { getOctokit } from "../lib/octokit.ts";
import {
  InstallationNotFoundError,
  OrgNotFoundError,
} from "./common/errors.ts";

export async function getInstallation(orgId: number, userId: number) {
  const org = await db.org.getById(orgId, {
    requireUser: { id: userId },
  });

  if (!org) {
    throw new OrgNotFoundError(null);
  }

  if (!org.githubInstallationId) {
    throw new InstallationNotFoundError(null);
  }

  const octokit = await getOctokit(org.githubInstallationId);
  const installation = await octokit.rest.apps.getInstallation({
    installation_id: org.githubInstallationId,
  });

  return {
    hasAllRepoAccess: installation.data.repository_selection === "all",
    targetId: installation.data.target_id,
    targetType: installation.data.target_type as "User" | "Organization",
    targetName:
      // `slug` is present when `account` is an Organization, and `login` is present when it's a User
      "slug" in installation.data.account
        ? installation.data.account.slug
        : installation.data.account.login,
  };
}
