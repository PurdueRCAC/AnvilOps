import { Context } from "openapi-backend";
import { components } from "../generated/openapi.ts";
import { HandlerResponse, type HandlerMap } from "../types.ts";
import { AuthenticatedRequest } from "../lib/api.ts";
import { type Response as ExpressResponse } from "express";

const updateApp: HandlerMap["updateApp"] = async (
  ctx: Context<
    { content: { "application/json": components["schemas"]["App"] } },
    { appId: number }
  >,
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
> => {
  throw new Error("Function not implemented.");
};

export default updateApp;
