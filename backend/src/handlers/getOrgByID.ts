import type { Octokit } from "octokit";
import { db } from "../db/index.ts";
import type { components } from "../generated/openapi.ts";
import { env } from "../lib/env.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getOrgByID: HandlerMap["getOrgByID"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const orgId: number = ctx.request.params.orgId;

  const org = await db.org.getById(orgId, { requireUser: { id: req.user.id } });

  if (!org) {
    return json(404, res, {
      code: 404,
      message: "Organization not found.",
    });
  }

  const [apps, appGroups, outgoingInvitations, users] = await Promise.all([
    db.app.listForOrg(org.id),
    db.appGroup.listForOrg(org.id),
    db.invitation.listOutgoingForOrg(org.id),
    db.org.listUsers(org.id),
  ]);

  let octokit: Promise<Octokit>;

  if (org.githubInstallationId) {
    octokit = getOctokit(org.githubInstallationId);
  }

  const hydratedApps = await Promise.all(
    apps.map(async (app) => {
      const [config, selectedDeployment] = await Promise.all([
        db.app.getDeploymentConfig(app.id),
        db.app.getMostRecentDeployment(app.id),
      ]);

      if (!config) {
        return null;
      }

      let repoURL: string;
      if (config.source === "GIT" && org.githubInstallationId) {
        try {
          const repo = await getRepoById(await octokit, config.repositoryId);
          repoURL = repo.html_url;
        } catch (error: any) {
          if (error?.status === 404) {
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
        imageTag: config.imageTag,
        repositoryURL: repoURL,
        branch: config.branch,
        commitHash: config.commitHash,
        link:
          selectedDeployment?.status === "COMPLETE" && env.APP_DOMAIN
            ? `${appDomain.protocol}//${app.subdomain}.${appDomain.host}`
            : undefined,
      };
    }),
  );

  const appGroupRes: components["schemas"]["Org"]["appGroups"] = appGroups.map(
    (group) => {
      return {
        ...group,
        apps: hydratedApps.filter((app) => app?.groupId === group.id),
      };
    },
  );

  return json(200, res, {
    id: org.id,
    name: org.name,
    members: users.map((membership) => ({
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      permissionLevel: membership.permissionLevel,
    })),
    githubInstallationId: org.githubInstallationId,
    appGroups: appGroupRes,
    outgoingInvitations: outgoingInvitations.map((inv) => ({
      id: inv.id,
      inviter: { name: inv.inviter.name },
      invitee: { name: inv.invitee.name },
      org: { id: inv.orgId, name: inv.org.name },
    })),
  });
};
