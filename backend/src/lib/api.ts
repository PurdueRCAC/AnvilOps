import addFormats from "ajv-formats";
import {
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from "express";
import path from "node:path";
import { OpenAPIBackend, type Context, type Request } from "openapi-backend";
import { type components } from "../generated/openapi.ts";
import { githubAppInstall } from "../handlers/githubAppInstall.ts";
import { githubWebhook } from "../handlers/githubWebhook.ts";
import {
  json,
  type HandlerMap,
  type HandlerResponse,
  type OptionalPromise,
} from "../types.ts";
import { db } from "./db.ts";
import { githubOAuthCallback } from "../handlers/githubOAuthCallback.ts";
import { githubInstallCallback } from "../handlers/githubInstallCallback.ts";
import { updateDeployment } from "../handlers/updateDeployment.ts";
import createApp from "../handlers/createApp.ts";
import updateApp from "../handlers/updateApp.ts";
import deleteApp from "../handlers/deleteApp.ts";

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
      const user = await db.user.findUnique({ where: { id: req.user.id } });
      const membership = await db.organizationMembership.findFirst({
        where: { userId: user.id },
      });
      const orgName = (
        await db.organization.findUnique({
          where: { id: membership.organizationId },
        })
      ).name;
      return json(200, res, {
        id: user.id,
        email: user.email,
        name: user.name,
        org: {
          id: membership.organizationId,
          name: orgName,
          isOwner: membership.permissionLevel === "OWNER",
        },
      });
    } catch (e) {
      console.log((e as Error).message);
      json(500, res, { code: 500, message: "Something went wrong." });
    }
  },
  getOrgs: async function (
    ctx: Context,
    req: AuthenticatedRequest,
    res: ExpressResponse,
  ): Promise<
    HandlerResponse<{
      200: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["UserOrg"][] };
      };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    try {
      const orgs = await db.organization.findMany({
        where: { users: { some: { userId: req.user.id } } },
        include: {
          users: {
            where: { userId: req.user.id },
            select: {
              permissionLevel: true,
            },
          },
        },
      });
      const result = orgs.map((o) => ({
        id: o.id,
        name: o.name,
        isOwner: o.users[0].permissionLevel === "OWNER",
      }));
      return json(200, res, result);
    } catch (e) {
      console.log((e as Error).message);
      return json(500, res, { code: 500, message: "Something went wrong." });
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
      console.log((e as Error).message);
      return json(500, res, { code: 500, message: "Something went wrong." });
    }
  },
  joinOrg: async function (
    ctx: Context<
      { content: { "application/json": { inviteCode: string } } },
      never
    >,
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
    ctx: Context<{ content: { "application/json": { name: string } } }, never>,
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
    const orgName = ctx.request.requestBody.content["application/json"].name;
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
      console.log((e as Error).message);
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
      const result = await db.organization.findFirst({
        where: {
          id: orgId,
          users: {
            some: {
              userId: req.user.id,
            },
          },
        },
      });

      if (!result) {
        return json(401, res, {});
      }

      const apps = await db.app.findMany({ where: { orgId } });
      return res.status(200).json({
        id: result.id,
        name: result.name,
        apps,
      });
    } catch (e) {
      console.log((e as Error).message);
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

      await db.organization.delete({ where: { id: orgId } });

      await db.app.deleteMany({ where: { orgId } });

      // TODO: delete resources

      return res.status(200);
    } catch (e) {
      console.log((e as Error).message);
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
      401: { headers: { [name: string]: unknown }; content?: never };
      500: {
        headers: { [name: string]: unknown };
        content: { "application/json": components["schemas"]["ApiError"] };
      };
    }>
  > {
    try {
      const appId = ctx.request.params.appId;
      const app = await db.app.findUnique({ where: { id: appId } });
      if (!app) return json(401, res, {});

      const organization = await db.organization.findFirst({
        where: {
          id: app.orgId,
          users: {
            some: {
              userId: req.user.id,
            },
          },
        },
      });

      if (!organization) return json(401, res, {});

      return json(200, res, {
        ...app,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString(),
      });
    } catch (e) {
      console.log((e as Error).message);
      return json(500, res, { code: 500, message: "Something went wrong." });
    }
  },
  createApp,
  updateApp,
  deleteApp,
  githubWebhook,
  githubAppInstall,
  githubOAuthCallback,
  githubInstallCallback,
  updateDeployment,
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
      formats: ["email", "uri", "date-time", "uuid", "int64", "uri-template"],
    });
    return ajv;
  },
});

const handler = (req: ExpressRequest, res: ExpressResponse) => {
  api.handleRequest(req as Request, req, res);
};

export default handler;
