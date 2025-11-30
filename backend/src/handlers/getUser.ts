import { db } from "../db/index.ts";
import {
  getProjectsForUser,
  isRancherManaged,
} from "../lib/cluster/rancher.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getUser: HandlerMap["getUser"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const [user, orgs, unassignedInstallations, receivedInvitations] =
    await Promise.all([
      db.user.getById(req.user.id),
      db.user.getOrgs(req.user.id),
      db.user.getUnassignedInstallations(req.user.id),
      db.invitation.listReceived(req.user.id),
    ]);

  const projects =
    user?.clusterUsername && isRancherManaged()
      ? await getProjectsForUser(user.clusterUsername)
      : undefined;

  return json(200, res, {
    id: user.id,
    email: user.email,
    name: user.name,
    orgs: orgs.map((item) => ({
      id: item.organization.id,
      name: item.organization.name,
      permissionLevel: item.permissionLevel,
      githubConnected: item.organization.githubInstallationId !== null,
    })),
    projects,
    unassignedInstallations: unassignedInstallations,
    receivedInvitations: receivedInvitations.map((inv) => ({
      id: inv.id,
      inviter: { name: inv.inviter.name },
      invitee: { name: inv.invitee.name },
      org: { id: inv.orgId, name: inv.org.name },
    })),
  });
};
