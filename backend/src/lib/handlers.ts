import { type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import { type Context } from "openapi-backend";
import { type components, type operations } from "../generated/openapi.ts";
import { db } from "./db.ts";

type OptionalPromise<T> = T | Promise<T>;
type HandlerMap = {
  [O in keyof operations]: (
    ctx: Context<
      operations[O]["requestBody"],
      operations[O]["parameters"]["path"],
      operations[O]["parameters"]["header"],
      operations[O]["parameters"]["query"],
      operations[O]["parameters"]["cookie"]
    >,
    req: ExpressRequest,
    res: ExpressResponse
  ) => OptionalPromise<HandlerResponse<operations[O]["responses"]>>;
};

type ResponseType = number | "default";
type ResponseMap = {
  [statusCode in ResponseType]?: {
    headers: any;
    content?: {
      "application/json": any;
    };
  };
};

type HandlerResponse<T extends ResponseMap> = ExpressResponse;

const json = <
  ResMap extends ResponseMap,
  Code extends keyof ResMap & number,
  Content extends ResMap[Code] extends never ? ResMap["default"]["content"]["application/json"] : (ResMap[Code]["content"]["application/json"]),
>(
  statusCode: Code,
  res: ExpressResponse,
  json: Content extends never ? {} : Required<Content>
): HandlerResponse<ResMap> => {
  return res.status(statusCode as number).json(json);
};


const handlers = {
  getUser: async function (ctx: Context, req: ExpressRequest, res: ExpressResponse): Promise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["User"]; }; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    try {
      const user = await db.user.findUnique({ where: { id: 1 } });
      const membership = await db.organizationMembership.findFirst({ where: { userId: user.id } });
      const orgName = (await db.organization.findUnique({ where: { id: membership.organizationId } })).name;
      return json(200, res, {
        id: user.id,
        email: user.email,
        name: user.name,
        org: {
          id: membership.organizationId,
          name: orgName,
          isOwner: membership.permissionLevel === 'OWNER',
        }
      });
    } catch (e) {
      json(500, res, { code: "500", message: (e as Error).message });
    }
  },
  getOrgs: async function (ctx: Context, req: ExpressRequest, res: ExpressResponse): Promise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["UserOrg"][]; }; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    try {
      const orgs = await db.organization.findMany({
        where: { users: { some: { userId: 1 } } },
        include: {
          users: {
            where: { userId: 1 },
            select: {
              permissionLevel: true,
            }
          }
        }
      });
      const result = orgs.map(o => ({ id: o.id, name: o.name, isOwner: o.users[0].permissionLevel === 'OWNER' }));
      return json(200, res, result);
    } catch (e) {
      return json(500, res, { code: "500", message: (e as Error).message });
    }
  },
  deleteUser: async function (ctx: Context, req: ExpressRequest, res: ExpressResponse): Promise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    try {
      await db.user.delete({ where: { id: 1 } });
      return res.status(200);
    } catch (e) {
      return json(500, res, { code: "500", message: (e as Error).message });
    }
  },
  logoutUser: function (ctx: Context, req: ExpressRequest, res: ExpressResponse): OptionalPromise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    throw new Error("Function not implemented.");
  },
  joinOrg: async function (ctx: Context<{ content: { "application/json": { inviteCode: string; }; }; }, never>, req: ExpressRequest, res: ExpressResponse): Promise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["UserOrg"]; }; }; 401: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    throw new Error("Function not implemented.");
  },
  createOrg: async function (ctx: Context<{ content: { "application/json": { name: string; }; }; }, never>, req: ExpressRequest, res: ExpressResponse): Promise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["Org"]; }; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    const orgName = ctx.request.requestBody.content["application/json"].name;
    try {
      const result = await db.organization.create({
        data: {
          name: orgName,
          users: {
            create: {
              permissionLevel: 'OWNER',
              user: {
                connect: { id: 1 }
              }
            }
          }
        }
      });
      return res.status(200).json({
        id: result.id,
        name: result.name,
        isOwner: true,
      });
    } catch (e) {
      return json(500, res, { code: "500", message: (e as Error).message });
    }
  },
  getOrgByID: async function (ctx: Context<{ orgId: number; }>, req: ExpressRequest, res: ExpressResponse): Promise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["Org"]; }; }; 401: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    try {
      const orgId = Number(ctx.request.params.orgId);
      const result = await db.organization.findUnique({ where: { id: orgId } });
      if (!result) return json(500, res, { code: "500", message: "Not found" });

      const apps = await db.app.findMany({ where: { orgId } });
      return res.status(200).json({
        id: result.id,
        name: result.name,
        apps
      });
    } catch (e) {
      return json(500, res, { code: "500", message: (e as Error).message });
    }
  },
  deleteOrgByID: async function (ctx: Context<{ orgId: number; }>, req: ExpressRequest, res: ExpressResponse): Promise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content?: never; }; 401: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    try {
      const orgId = ctx.request.params.orgId;
      await db.organization.delete({ where: { id: orgId } });

      await db.app.deleteMany({ where: { orgId } });
      return res.status(200);
    } catch (e) {
      return json(500, res, { code: "500", message: (e as Error).message });
    }
  },
  getInviteCodeByID: function (ctx: Context<{ orgId: number; }>, req: ExpressRequest, res: ExpressResponse): OptionalPromise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content?: never; }; 401: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    throw new Error("Function not implemented.");
  },
  getAppByID: async function (ctx: Context<{ appId: number; }>, req: ExpressRequest, res: ExpressResponse): Promise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["App"]; }; }; 401: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    try {
      const appId = ctx.request.params.appId;
      const result = await db.app.findUnique({ where: { id: appId } });
      if (!result) return res.status(404);

      return json(200, res, {
        ...result,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      });
    } catch (e) {
      return json(500, res, { code: "500", message: (e as Error).message });
    }
  },
  createApp: function (ctx: Context<{ content: { "application/json": components["schemas"]["App"]; }; }>, req: ExpressRequest, res: ExpressResponse): OptionalPromise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    throw new Error("Function not implemented.");
  },
  updateApp: function (ctx: Context<{ content: { "application/json": components["schemas"]["App"]; }; }, { appId: number; }>, req: ExpressRequest, res: ExpressResponse): OptionalPromise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content?: never; }; 401: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    throw new Error("Function not implemented.");
  },
  deleteApp: function (ctx: Context<never, { appId: number; }>, req: ExpressRequest, res: ExpressResponse): OptionalPromise<HandlerResponse<{ 200: { headers: { [name: string]: unknown; }; content?: never; }; 401: { headers: { [name: string]: unknown; }; content?: never; }; 500: { headers: { [name: string]: unknown; }; content: { "application/json": components["schemas"]["ResponseError"]; }; }; }>> {
    throw new Error("Function not implemented.");
  }
} satisfies HandlerMap;


export default handlers;