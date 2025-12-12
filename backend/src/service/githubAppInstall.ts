import { randomBytes } from "node:crypto";
import { db } from "../db/index.ts";
import type { GitHubOAuthState } from "../db/models.ts";
import {
  PermissionLevel,
  type GitHubOAuthAction,
} from "../generated/prisma/enums.ts";
import { OrgAlreadyLinkedError, OrgNotFoundError } from "./common/errors.ts";

export async function createGitHubAppInstallState(
  orgId: number,
  userId: number,
) {
  const org = await db.org.getById(orgId, {
    requireUser: { id: userId, permissionLevel: PermissionLevel.OWNER },
  });

  if (org.githubInstallationId) {
    throw new OrgAlreadyLinkedError();
  }

  if (org === null) {
    throw new OrgNotFoundError(null);
  }

  return await createState("CREATE_INSTALLATION", userId, orgId);
}

export async function createState(
  action: GitHubOAuthAction,
  userId: number,
  orgId: number,
) {
  const random = randomBytes(64).toString("base64url");
  await db.user.setOAuthState(orgId, userId, action, random);
  return random;
}

export async function verifyState(random: string): Promise<GitHubOAuthState> {
  return await db.user.getAndDeleteOAuthState(random);
}
