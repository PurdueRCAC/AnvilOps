import type { AppRepo } from "../db/repo/app.ts";
import type { AppGroupRepo } from "../db/repo/appGroup.ts";
import type { InvitationRepo } from "../db/repo/invitation.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { components } from "../generated/openapi.ts";
import { env } from "../lib/env.ts";
import { getGitProvider, type GitProvider } from "../lib/git/gitProvider.ts";
import {
  InstallationNotFoundError,
  OrgNotFoundError,
  RepositoryNotFoundError,
} from "./errors/index.ts";

export class GetOrgByIDService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private appGroupRepo: AppGroupRepo;
  private invitationRepo: InvitationRepo;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    appGroupRepo: AppGroupRepo,
    invitationRepo: InvitationRepo,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.appGroupRepo = appGroupRepo;
    this.invitationRepo = invitationRepo;
  }

  async getOrgByID(orgId: number, userId: number) {
    const org = await this.orgRepo.getById(orgId, {
      requireUser: { id: userId },
    });

    if (!org) {
      throw new OrgNotFoundError(null);
    }

    const [apps, appGroups, outgoingInvitations, users] = await Promise.all([
      this.appRepo.listForOrg(org.id),
      this.appGroupRepo.listForOrg(org.id),
      this.invitationRepo.listOutgoingForOrg(org.id),
      this.orgRepo.listUsers(org.id),
    ]);

    let gitProvider: GitProvider;
    try {
      gitProvider = await getGitProvider(org.id);
    } catch (e) {
      if (!(e instanceof InstallationNotFoundError)) {
        throw e;
      }
    }

    const hydratedApps = await Promise.all(
      apps.map(async (app) => {
        const [config, selectedDeployment] = await Promise.all([
          this.appRepo.getDeploymentConfig(app.id),
          this.appRepo.getMostRecentDeployment(app.id),
        ]);

        if (!config) {
          return null;
        }

        let repoURL: string;
        if (config.source === "GIT") {
          try {
            const repo = await gitProvider?.getRepoById(config.repositoryId);
            repoURL = repo?.htmlURL;
          } catch (error) {
            if (error instanceof RepositoryNotFoundError) {
              // The repo couldn't be found. Either it doesn't exist or the installation doesn't have permission to see it.
              return;
            }
            throw error; // Rethrow all other kinds of errors
          }
        }

        const appDomain = URL.parse(env.APP_DOMAIN);

        return {
          id: app.id,
          groupId: app.appGroupId,
          displayName: app.displayName,
          status: selectedDeployment?.status,
          source: config.source,
          ...(config.appType === "workload" && {
            imageTag: config.imageTag,
            repositoryURL: repoURL,
            branch: config.branch,
            commitHash: config.commitHash,
            link:
              selectedDeployment?.status === "COMPLETE" &&
              env.APP_DOMAIN &&
              config.createIngress
                ? `${appDomain.protocol}//${config.subdomain}.${appDomain.host}`
                : undefined,
          }),
        };
      }),
    );

    const appGroupRes: components["schemas"]["Org"]["appGroups"] =
      appGroups.map((group) => {
        return {
          ...group,
          apps: hydratedApps.filter((app) => app?.groupId === group.id),
        };
      });

    return {
      id: org.id,
      name: org.name,
      members: users.map((membership) => ({
        id: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        permissionLevel: membership.permissionLevel,
      })),
      appGroups: appGroupRes,
      outgoingInvitations: outgoingInvitations.map((inv) => ({
        id: inv.id,
        inviter: { name: inv.inviter.name },
        invitee: { name: inv.invitee.name },
        org: { id: inv.orgId, name: inv.org.name },
      })),
    };
  }
}
