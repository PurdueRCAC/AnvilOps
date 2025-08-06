import {
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from "express";
import fs from "fs";
import type { Octokit } from "octokit";
import type { Context } from "openapi-backend";
import type { components } from "../generated/openapi.ts";
import {
  deleteNamespace,
  getClientForClusterUsername,
  getClientsForRequest,
  namespaceInUse,
  svcK8s,
} from "../lib/cluster/kubernetes.ts";
import {
  getProjectsForUser,
  isRancherManaged,
} from "../lib/cluster/rancher.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { generateVolumeName } from "../lib/cluster/resources/statefulset.ts";
import { db } from "../lib/db.ts";
import { env } from "../lib/env.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import {
  json,
  type HandlerMap,
  type HandlerResponse,
  type OptionalPromise,
} from "../types.ts";
import { acceptInvitation } from "./acceptInvitation.ts";
import { claimOrg } from "./claimOrg.ts";
import { createApp } from "./createApp.ts";
import { createAppGroup } from "./createAppGroup.ts";
import { deleteApp } from "./deleteApp.ts";
import { deleteAppGroup } from "./deleteAppGroup.ts";
import { deleteAppPod } from "./deleteAppPod.ts";
import {
  deleteAppFile,
  downloadAppFile,
  getAppFile,
  writeAppFile,
} from "./files.ts";
import { getAppLogs } from "./getAppLogs.ts";
import { getAppStatus } from "./getAppStatus.ts";
import { getDeployment } from "./getDeployment.ts";
import { getInstallation } from "./getInstallation.ts";
import { getSettings } from "./getSettings.ts";
import { githubAppInstall } from "./githubAppInstall.ts";
import { githubInstallCallback } from "./githubInstallCallback.ts";
import { githubOAuthCallback } from "./githubOAuthCallback.ts";
import { githubWebhook } from "./githubWebhook.ts";
import { importGitRepo, importGitRepoCreateState } from "./importGitRepo.ts";
import { ingestLogs } from "./ingestLogs.ts";
import { inviteUser } from "./inviteUser.ts";
import { listDeployments } from "./listDeployments.ts";
import { listOrgRepos } from "./listOrgRepos.ts";
import { listRepoBranches } from "./listRepoBranches.ts";
import { listRepoWorkflows } from "./listRepoWorkflows.ts";
import { removeUserFromOrg } from "./removeUserFromOrg.ts";
import { revokeInvitation } from "./revokeInvitation.ts";
import { updateApp } from "./updateApp.ts";
import { updateDeployment } from "./updateDeployment.ts";

export type AuthenticatedRequest = ExpressRequest & {
  user: {
    id: number;
    email?: string;
    name?: string;
  };
};

export const handlers = {
  getUser: async function (
    ctx: Context,
    req: AuthenticatedRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["User"] };
      };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    try {
      const user = await db.user.findUnique({
        where: { id: req.user.id },
        include: {
          orgs: { include: { organization: true } },
          unassignedInstallations: true,
          receivedInvitations: {
            include: {
              inviter: { select: { name: true } },
              invitee: { select: { name: true } },
              org: { select: { name: true } },
            },
          },
        },
      });

      const projects =
        user?.clusterUsername && isRancherManaged()
          ? await getProjectsForUser(user.clusterUsername)
          : undefined;

      return json(200, res, {
        id: user.id,
        email: user.email,
        name: user.name,
        orgs: user.orgs.map((item) => ({
          id: item.organization.id,
          name: item.organization.name,
          permissionLevel: item.permissionLevel,
          githubConnected: item.organization.githubInstallationId !== null,
        })),
        projects,
        unassignedInstallations: user.unassignedInstallations,
        receivedInvitations: user.receivedInvitations.map((inv) => ({
          id: inv.id,
          inviter: { name: inv.inviter.name },
          invitee: { name: inv.invitee.name },
          org: { id: inv.orgId, name: inv.org.name },
        })),
      });
    } catch (e) {
      console.error(e);
      json(500, res, { code: 500, message: "Something went wrong." });
    }
  },
  deleteUser: async function (
    ctx: Context,
    req: AuthenticatedRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: { headers: { [name: string]: unknown }; content?: never };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    try {
      await db.user.delete({ where: { id: req.user.id } });
      return res.status(200);
    } catch (e) {
      console.error(e);
      return json(500, res, { code: 500, message: "Something went wrong." });
    }
  },
  createOrg: async function (
    ctx,
    req: AuthenticatedRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["Org"] };
      };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    const orgName = ctx.request.requestBody.name;
    try {
      const result = await db.organization.create({
        data: {
          name: orgName,
          users: {
            create: {
              permissionLevel: "OWNER",
              user: {
                connect: { id: req.user.id },
              },
            },
          },
        },
      });
      return res.status(200).json({
        id: result.id,
        name: result.name,
        isOwner: true,
      });
    } catch (e) {
      console.error(e);
      return json(500, res, { code: 500, message: "Something went wrong." });
    }
  },
  getOrgByID: async function (
    ctx: Context<{ orgId: number }>,
    req: AuthenticatedRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["Org"] };
      };
      401: { headers: { [name: string]: unknown }; content?: never };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    try {
      const orgId: number = ctx.request.params.orgId;
      const org = await db.organization.findFirst({
        where: {
          id: orgId,
          users: {
            some: {
              userId: req.user.id,
            },
          },
        },
        include: {
          appGroups: {
            include: {
              apps: {
                include: {
                  config: true,
                  deployments: {
                    include: {
                      config: true,
                    },
                    orderBy: { createdAt: "desc" },
                  },
                },
              },
            },
          },
          outgoingInvitations: {
            include: {
              invitee: { select: { name: true } },
              inviter: { select: { name: true } },
              org: { select: { name: true } },
            },
          },
          users: {
            select: {
              user: { select: { id: true, name: true, email: true } },
              permissionLevel: true,
            },
          },
        },
      });

      if (!org) {
        return json(401, res, {});
      }

      let octokit: Octokit;

      const appGroupRes: components["schemas"]["Org"]["appGroups"] =
        await Promise.all(
          org.appGroups.map(async (group) => {
            const apps = await Promise.all(
              group.apps.map(async (app) => {
                let repoURL: string;
                if (app.config.source === "GIT" && org.githubInstallationId) {
                  if (!octokit) {
                    octokit = await getOctokit(org.githubInstallationId);
                  }
                  const repo = await getRepoById(
                    octokit,
                    app.config.repositoryId,
                  );
                  repoURL = repo.html_url;
                }

                const latestCompleteDeployment = app.deployments.find(
                  (deploy) => deploy.status === "COMPLETE",
                );
                const selectedDeployment =
                  latestCompleteDeployment ?? app.deployments[0];

                const appDomain = URL.parse(env.APP_DOMAIN);

                return {
                  id: app.id,
                  displayName: app.displayName,
                  status: selectedDeployment?.status,
                  source: selectedDeployment?.config.source,
                  imageTag: selectedDeployment?.config?.imageTag,
                  repositoryURL: repoURL,
                  branch: app.config.branch,
                  commitHash: selectedDeployment?.commitHash,
                  link:
                    selectedDeployment?.status === "COMPLETE" && env.APP_DOMAIN
                      ? `${appDomain.protocol}//${app.subdomain}.${appDomain.host}`
                      : undefined,
                };
              }),
            );
            return { ...group, apps };
          }),
        );

      return json(200, res, {
        id: org.id,
        name: org.name,
        members: org.users.map((membership) => ({
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          permissionLevel: membership.permissionLevel,
        })),
        githubInstallationId: org.githubInstallationId,
        appGroups: appGroupRes,
        outgoingInvitations: org.outgoingInvitations.map((inv) => ({
          id: inv.id,
          inviter: { name: inv.inviter.name },
          invitee: { name: inv.invitee.name },
          org: { id: inv.orgId, name: inv.org.name },
        })),
      });
    } catch (e) {
      console.error(e);
      return json(500, res, { code: 500, message: "Something went wrong." });
    }
  },
  deleteOrgByID: async function (
    ctx: Context<{ orgId: number }>,
    req: AuthenticatedRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: { headers: { [name: string]: unknown }; content?: never };
      401: { headers: { [name: string]: unknown }; content?: never };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    try {
      const orgId = ctx.request.params.orgId;
      const result = await db.organization.findFirst({
        where: {
          id: orgId,
          users: {
            some: {
              userId: req.user.id,
              permissionLevel: "OWNER",
            },
          },
        },
      });

      if (!result) {
        return json(401, res, {});
      }

      const { clusterUsername } = await db.user.findUnique({
        where: { id: req.user.id },
        select: { clusterUsername: true },
      });

      const userApi = getClientForClusterUsername(
        clusterUsername,
        "KubernetesObjectApi",
        true,
      );

      const apps = await db.app.findMany({
        where: { orgId },
        include: {
          deployments: {
            where: {
              status: {
                in: ["DEPLOYING", "COMPLETE", "ERROR"],
              },
            },
          },
        },
      });
      for (let app of apps) {
        if (app.deployments.length > 0) {
          try {
            const api =
              app.projectId === env["SANDBOX_ID"]
                ? svcK8s["KubernetesObjectApi"]
                : userApi;
            await deleteNamespace(api, getNamespace(app.subdomain));
          } catch (err) {
            console.error(err);
          }
          await db.deployment.updateMany({
            where: {
              id: {
                in: app.deployments.map((deploy) => deploy.id),
              },
            },
            data: { status: "STOPPED" },
          });
        }

        await db.deployment.deleteMany({ where: { appId: app.id } });
      }
      await db.organization.delete({ where: { id: orgId } });
      return json(200, res, {});
    } catch (e) {
      console.error(e);
      return json(500, res, { code: 500, message: "Something went wrong." });
    }
  },
  getInviteCodeByID: function (
    ctx: Context<{ orgId: number }>,
    req: AuthenticatedRequest,
    res: ExpressResponse,
  ): OptionalPromise<
    HandlerResponse<{
      200: { headers: { [name: string]: unknown }; content?: never };
      401: { headers: { [name: string]: unknown }; content?: never };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    throw new Error("Function not implemented.");
  },
  getAppByID: async function (
    ctx: Context<{ appId: number }>,
    req: AuthenticatedRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["App"] };
      };
      404: { headers: { [name: string]: unknown }; content?: never };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    try {
      const appId = ctx.request.params.appId;
      const [app, deploymentCount] = await Promise.all([
        db.app.findUnique({
          where: {
            id: appId,
            org: { users: { some: { userId: req.user.id } } },
          },
          include: {
            deployments: {
              take: 1,
              orderBy: { createdAt: "desc" },
              include: { config: true },
            },
            appGroup: true,
            config: true,
            org: true,
          },
        }),
        db.deployment.count({ where: { appId } }),
      ]);

      if (!app) return json(404, res, {});

      // Fetch repository info if this app is deployed from a Git repository
      // Fetch the current StatefulSet to read its labels
      const k8sDeployment = await (async () => {
        try {
          const { AppsV1Api: api } = await getClientsForRequest(
            req.user.id,
            app.projectId,
            ["AppsV1Api"],
          );
          return await api.readNamespacedStatefulSet({
            namespace: getNamespace(app.subdomain),
            name: app.name,
          });
        } catch {}
      })();

      const activeDeployment =
        k8sDeployment?.spec?.template?.metadata?.labels?.[
          "anvilops.rcac.purdue.edu/deployment-id"
        ];

      const currentConfig = app.config;

      // Fetch repository info if this app is deployed from a Git repository
      const { repoId, repoURL } = await (async () => {
        if (currentConfig.source === "GIT") {
          const octokit = await getOctokit(app.org.githubInstallationId);
          const repo = await getRepoById(octokit, currentConfig.repositoryId);
          return { repoId: repo.id, repoURL: repo.html_url };
        } else {
          return { repoId: undefined, repoURL: undefined };
        }
      })();

      // TODO: Separate this into several API calls
      return json(200, res, {
        id: app.id,
        orgId: app.orgId,
        projectId: app.projectId,
        name: app.name,
        displayName: app.displayName,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString(),
        repositoryId: repoId,
        repositoryURL: repoURL,
        subdomain: app.subdomain,
        cdEnabled: app.enableCD,
        config: {
          port: currentConfig.fieldValues.port,
          env: currentConfig.displayEnv,
          replicas: currentConfig.fieldValues.replicas,
          mounts: currentConfig.fieldValues.mounts.map((mount) => ({
            amountInMiB: mount.amountInMiB,
            path: mount.path,
            volumeClaimName: generateVolumeName(mount.path),
          })),
          requests: currentConfig.fieldValues.extra.requests,
          limits: currentConfig.fieldValues.extra.limits,
          ...currentConfig.fieldValues.extra,
          ...(currentConfig.source === "GIT"
            ? {
                source: "git",
                branch: currentConfig.branch,
                dockerfilePath: currentConfig.dockerfilePath,
                rootDir: currentConfig.rootDir,
                builder: currentConfig.builder,
                repositoryId: currentConfig.repositoryId,
                event: currentConfig.event,
                eventId: currentConfig.eventId,
              }
            : {
                source: "image",
                imageTag: currentConfig.imageTag,
              }),
        },
        appGroup: {
          standalone: app.appGroup.isMono,
          name: !app.appGroup.isMono ? app.appGroup.name : undefined,
          id: app.appGroupId,
        },
        activeDeployment: activeDeployment
          ? parseInt(activeDeployment)
          : undefined,
        deploymentCount,
      });
    } catch (e) {
      console.error(e);
      return json(500, res, { code: 500, message: "Something went wrong." });
    }
  },

  setAppCD: async function (
    ctx: Context<{ enable: boolean }, { appId: number }>,
    req: AuthenticatedRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: { headers: { [name: string]: unknown }; content?: never };
      404: { headers: { [name: string]: unknown }; content?: never };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    const app = await db.app.findUnique({
      where: {
        id: ctx.request.params.appId,
        org: { users: { some: { userId: req.user.id } } },
      },
    });

    if (!app) {
      return json(404, res, {});
    }

    await db.app.update({
      where: { id: ctx.request.params.appId },
      data: { enableCD: ctx.request.requestBody.enable },
    });

    return json(200, res, {});
  },

  isSubdomainAvailable: async function (
    ctx: Context<never, never, { subdomain: string }>,
    req: ExpressRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: {
        headers: { [name: string]: unknown };
        content: { "application/json": { available: boolean } };
      };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    const subdomain = ctx.request.query.subdomain;
    try {
      const namespaceExists = namespaceInUse(getNamespace(subdomain));
      const subdomainUsedByApp = db.app.count({
        where: { subdomain },
      });
      // Check database in addition to resources in case the namespace is taken but not finished creating
      const canUse = (await Promise.all([namespaceExists, subdomainUsedByApp]))
        .map((value) => !!value)
        .reduce((prev, cur) => prev && !cur, true);
      return json(200, res, { available: canUse });
    } catch (err) {
      console.error(err);
      return json(500, res, { code: 500, message: "Something went wrong." });
    }
  },
  listOrgGroups: async function (
    ctx: Context<never, { orgId: number }>,
    req: ExpressRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: {
        headers: { [name: string]: unknown };
        content: { "application/json": { id: number; name: string }[] };
      };
    }>
  > {
    const orgId = ctx.request.params.orgId;
    const { appGroups } = await db.organization.findUnique({
      where: { id: orgId },
      select: {
        appGroups: {
          select: { id: true, name: true },
          where: { isMono: false },
        },
      },
    });
    return json(
      200,
      res,
      appGroups.map((group) => ({
        id: group.id,
        name: group.name,
      })),
    );
  },
  getTemplates: function (
    ctx: Context,
    req: ExpressRequest,
    res: ExpressResponse,
  ): OptionalPromise<
    HandlerResponse<{
      200: {
        headers: { [name: string]: unknown };
        content: {
          "application/json": {
            [key: string]: {
              displayName: string;
              url: string;
              description: string;
              port: number;
            };
          };
        };
      };
    }>
  > {
    const path =
      process.env.NODE_ENV === "development"
        ? "../templates/templates.json"
        : "./templates.json";
    const data = JSON.parse(fs.readFileSync(path, "utf8")) as {
      [key: string]: {
        displayName: string;
        url: string;
        description: string;
        port: number;
      };
    };
    return json(200, res, data);
  },
  createApp,
  createAppGroup,
  claimOrg,
  updateApp,
  deleteApp,
  deleteAppGroup,
  githubWebhook,
  githubAppInstall,
  githubOAuthCallback,
  githubInstallCallback,
  updateDeployment,
  listOrgRepos,
  listRepoBranches,
  listRepoWorkflows,
  listDeployments,
  getDeployment,
  getAppLogs,
  ingestLogs,
  importGitRepoCreateState,
  importGitRepo,
  getInstallation,
  getAppStatus,
  deleteAppPod,
  getAppFile,
  downloadAppFile,
  writeAppFile,
  deleteAppFile,
  getSettings,
  acceptInvitation,
  inviteUser,
  removeUserFromOrg,
  revokeInvitation,
} satisfies HandlerMap;
Object.freeze(handlers);
