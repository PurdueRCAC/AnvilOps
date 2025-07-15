import addFormats from "ajv-formats";
import {
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from "express";
import path from "node:path";
import type { Octokit } from "octokit";
import { OpenAPIBackend, type Context, type Request } from "openapi-backend";
import { type components } from "../generated/openapi.ts";
import createApp from "../handlers/createApp.ts";
import createAppGroup from "../handlers/createAppGroup.ts";
import deleteApp from "../handlers/deleteApp.ts";
import deleteAppGroup from "../handlers/deleteAppGroup.ts";
import { deleteAppPod } from "../handlers/deleteAppPod.ts";
import {
  deleteAppFile,
  downloadAppFile,
  getAppFile,
  writeAppFile,
} from "../handlers/files.ts";
import { getAppLogs } from "../handlers/getAppLogs.ts";
import { getAppStatus } from "../handlers/getAppStatus.ts";
import { getDeployment } from "../handlers/getDeployment.ts";
import { getInstallation } from "../handlers/getInstallation.ts";
import { githubAppInstall } from "../handlers/githubAppInstall.ts";
import { githubInstallCallback } from "../handlers/githubInstallCallback.ts";
import { githubOAuthCallback } from "../handlers/githubOAuthCallback.ts";
import { githubWebhook } from "../handlers/githubWebhook.ts";
import {
  importGitRepo,
  importGitRepoCreateState,
} from "../handlers/importGitRepo.ts";
import { ingestLogs } from "../handlers/ingestLogs.ts";
import { listDeployments } from "../handlers/listDeployments.ts";
import { listOrgRepos } from "../handlers/listOrgRepos.ts";
import { listRepoBranches } from "../handlers/listRepoBranches.ts";
import updateApp from "../handlers/updateApp.ts";
import { updateDeployment } from "../handlers/updateDeployment.ts";
import {
  json,
  type HandlerMap,
  type HandlerResponse,
  type OptionalPromise,
} from "../types.ts";
import { db } from "./db.ts";
import {
  deleteNamespace,
  generateVolumeName,
  getNamespace,
  k8s,
  namespaceInUse,
} from "./kubernetes.ts";
import { getOctokit, getRepoById } from "./octokit.ts";
import { listRepoWorkflows } from "../handlers/listRepoWorkflows.ts";
import fs from "fs";

export type AuthenticatedRequest = ExpressRequest & {
  user: {
    id: number;
    email?: string;
    name?: string;
  };
};

const handlers = {
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
        include: { orgs: { include: { organization: true } } },
      });
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
      });
    } catch (e) {
      console.log((e as Error).message);
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
  joinOrg: async function (
    ctx,
    req: AuthenticatedRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["UserOrg"] };
      };
      401: { headers: { [name: string]: unknown }; content?: never };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    throw new Error("Function not implemented.");
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
                  deploymentConfigTemplate: true,
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
                if (app.deploymentConfigTemplate.source === "GIT") {
                  if (!octokit) {
                    octokit = await getOctokit(org.githubInstallationId);
                  }
                  const repo = await getRepoById(
                    octokit,
                    app.deploymentConfigTemplate.repositoryId,
                  );
                  repoURL = repo.html_url;
                }

                const latestCompleteDeployment = app.deployments.find(
                  (deploy) => deploy.status === "COMPLETE",
                );
                const selectedDeployment =
                  latestCompleteDeployment ?? app.deployments[0];
                return {
                  id: app.id,
                  displayName: app.displayName,
                  status: selectedDeployment.status,
                  source: selectedDeployment.config.source,
                  imageTag: selectedDeployment.config?.imageTag,
                  repositoryURL: repoURL,
                  branch: app.deploymentConfigTemplate.branch,
                  commitHash: selectedDeployment.commitHash,
                  link:
                    selectedDeployment.status === "COMPLETE"
                      ? `https://${app.subdomain}.anvilops.rcac.purdue.edu`
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
            await deleteNamespace(getNamespace(app.subdomain));
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
      const app = await db.app.findUnique({
        where: { id: appId, org: { users: { some: { userId: req.user.id } } } },
        include: {
          deployments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: { config: true },
          },
          appGroup: true,
          deploymentConfigTemplate: { include: { mounts: true } },
          org: true,
        },
      });
      if (!app) return json(404, res, {});

      const [{ repoId, repoURL }, k8sDeployment] = await Promise.all([
        // Fetch repository info if this app is deployed from a Git repository
        (async () => {
          if (app.deploymentConfigTemplate.source === "GIT") {
            const octokit = await getOctokit(app.org.githubInstallationId);
            const repo = await getRepoById(
              octokit,
              app.deploymentConfigTemplate.repositoryId,
            );
            return { repoId: repo.id, repoURL: repo.html_url };
          } else {
            return { repoId: undefined, repoURL: undefined };
          }
        })(),
        // Fetch the current StatefulSet to read its labels
        (async () => {
          try {
            return await k8s.apps.readNamespacedStatefulSet({
              namespace: getNamespace(app.subdomain),
              name: app.name,
            });
          } catch {}
        })(),
      ]);

      const activeDeployment =
        k8sDeployment?.spec?.template?.metadata?.labels?.[
          "anvilops.rcac.purdue.edu/deployment-id"
        ];

      return json(200, res, {
        id: app.id,
        orgId: app.orgId,
        name: app.name,
        displayName: app.displayName,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString(),
        repositoryId: repoId,
        repositoryURL: repoURL,
        subdomain: app.subdomain,
        config: {
          port: app.deploymentConfigTemplate.port,
          env: app.deploymentConfigTemplate.displayEnv,
          replicas: app.deploymentConfigTemplate.replicas,
          mounts: app.deploymentConfigTemplate.mounts.map((mount) => ({
            amountInMiB: mount.amountInMiB,
            path: mount.path,
            volumeClaimName: generateVolumeName(mount.path),
          })),
          postStart: app.deploymentConfigTemplate.postStart,
          preStop: app.deploymentConfigTemplate.preStop,
          ...(app.deploymentConfigTemplate.source === "GIT"
            ? {
                source: "git",
                branch: app.deploymentConfigTemplate.branch,
                dockerfilePath: app.deploymentConfigTemplate.dockerfilePath,
                rootDir: app.deploymentConfigTemplate.rootDir,
                builder: app.deploymentConfigTemplate.builder,
                repositoryId: app.deploymentConfigTemplate.repositoryId,
                event: app.deploymentConfigTemplate.event,
                eventId: app.deploymentConfigTemplate.eventId,
              }
            : {
                source: "image",
                imageTag: app.deploymentConfigTemplate.imageTag,
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
      });
    } catch (e) {
      console.error(e);
      return json(500, res, { code: 500, message: "Something went wrong." });
    }
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
      appGroups.map((group) => ({ id: group.id, name: group.name })),
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
} satisfies HandlerMap;

export const openApiSpecPath = path.resolve(
  path.dirname(path.dirname(import.meta.dirname)),
  "..",
  "openapi",
  "openapi.yaml",
);

const api = new OpenAPIBackend({
  definition: openApiSpecPath,
  handlers: {
    ...handlers,

    methodNotAllowed: (ctxt, req, res) => {
      return res.status(405).json({ code: 405, message: "Method not allowed" });
    },

    notFound: (ctxt, req, res) => {
      return res.status(404).json({ code: 404, message: "No such method" });
    },

    validationFail: (ctx, req, res) => {
      return res.status(400).json({
        code: 400,
        message: "Request validation failed",
        errors: ctx.validation.errors,
      });
    },
  },
  ajvOpts: { coerceTypes: "array" },
  coerceTypes: true,
  customizeAjv: (ajv) => {
    addFormats.default(ajv, {
      mode: "fast",
      formats: [
        "email",
        "uri",
        "date-time",
        "uuid",
        "int64",
        "uri-template",
        "hostname",
      ],
    });
    return ajv;
  },
});

api.init();

const handler = async (req: ExpressRequest, res: ExpressResponse) => {
  await api.handleRequest(req as Request, req, res);
};

export default handler;
