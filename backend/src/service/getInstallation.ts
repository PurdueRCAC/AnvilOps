import { db } from "../db/index.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { OrgNotFoundError } from "./common/errors.ts";

export async function getInstallation(orgId: number, userId: number) {
  const org = await db.org.getById(orgId, {
    requireUser: { id: userId },
  });

  if (!org) {
    throw new OrgNotFoundError(null);
  }

  const gitProvider = await getGitProvider(org.id);
  const installation = await gitProvider.getInstallationInfo();

  return {
    hasAllRepoAccess: installation.hasAllRepoAccess,
    targetId: installation.targetId,
    targetType: installation.targetType,
    targetName: installation.targetName,
  };
}
