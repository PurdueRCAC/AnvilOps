import type { InvitationRepo } from "../db/repo/invitation.ts";
import type { UserRepo } from "../db/repo/user.ts";
import type { RancherService } from "./common/cluster/rancher.ts";
import type { RancherAccessService } from "./common/cluster/rancherAccess.ts";
import type { GitProviderFactoryService } from "./common/git/gitProvider.ts";

export class GetUserService {
  private userRepo: UserRepo;
  private invitationRepo: InvitationRepo;
  private gitProviderFactoryService: GitProviderFactoryService;
  private rancherService: RancherService;
  private rancherAccessService: RancherAccessService;

  constructor(
    userRepo: UserRepo,
    invitationRepo: InvitationRepo,
    gitProviderFactoryService: GitProviderFactoryService,
    rancherService: RancherService,
    rancherAccessService: RancherAccessService,
  ) {
    this.userRepo = userRepo;
    this.invitationRepo = invitationRepo;
    this.gitProviderFactoryService = gitProviderFactoryService;
    this.rancherService = rancherService;
    this.rancherAccessService = rancherAccessService;
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
      user?.clusterUsername && this.rancherService.isRancherManaged()
        ? await this.rancherAccessService.getProjectsForUser(
            user.clusterUsername,
          )
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
          gitProvider: await this.gitProviderFactoryService.getGitProviderType(
            item.organization.id,
          ),
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
