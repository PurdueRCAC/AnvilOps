import type { InvitationRepo } from "../db/repo/invitation.ts";
import type { UserRepo } from "../db/repo/user.ts";
import {
  getProjectsForUser,
  isRancherManaged,
} from "../lib/cluster/rancher.ts";
import { getGitProviderType } from "../lib/git/gitProvider.ts";

export class GetUserService {
  private userRepo: UserRepo;
  private invitationRepo: InvitationRepo;

  constructor(userRepo: UserRepo, invitationRepo: InvitationRepo) {
    this.userRepo = userRepo;
    this.invitationRepo = invitationRepo;
  }

  async getUser(userId: number) {
    const [user, orgs, unassignedInstallations, receivedInvitations] =
      await Promise.all([
        this.userRepo.getById(userId),
        this.userRepo.getOrgs(userId),
        this.userRepo.getUnassignedInstallations(userId),
        this.invitationRepo.listReceived(userId),
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
}
