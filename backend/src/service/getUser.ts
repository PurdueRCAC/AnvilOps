import { db } from "../db/index.ts";
import {
  getProjectsForUser,
  isRancherManaged,
} from "../lib/cluster/rancher.ts";
import { getGitProviderType } from "../lib/git/gitProvider.ts";

export async function getUser(userId: number) {
  const [user, orgs, unassignedInstallations, receivedInvitations] =
    await Promise.all([
      db.user.getById(userId),
      db.user.getOrgs(userId),
      db.user.getUnassignedInstallations(userId),
      db.invitation.listReceived(userId),
    ]);

  const projects =
    user?.clusterUsername && isRancherManaged()
      ? await getProjectsForUser(user.clusterUsername)
      : undefined;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    orgs: await Promise.all(
      orgs.map(async (item) => ({
        id: item.organization.id,
        name: item.organization.name,
        permissionLevel: item.permissionLevel,
        gitProvider: await getGitProviderType(item.organization.id),
      })),
    ),
    projects,
    unassignedInstallations: unassignedInstallations,
    receivedInvitations: receivedInvitations.map((inv) => ({
      id: inv.id,
      inviter: { name: inv.inviter.name },
      invitee: { name: inv.invitee.name },
      org: { id: inv.orgId, name: inv.org.name },
    })),
  };
}
