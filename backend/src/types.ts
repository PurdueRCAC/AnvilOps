import {
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from "express";
import type { Context } from "openapi-backend";
import type { operations } from "./generated/openapi.ts";

export type OptionalPromise<T> = T | Promise<T>;
type apiOperations = Exclude<operations, { [key: `auth${string}`]: any }>;
export type HandlerMap = {
  [O in keyof apiOperations]: (
    ctx: Context<
      apiOperations[O]["requestBody"],
      apiOperations[O]["parameters"]["path"],
      apiOperations[O]["parameters"]["query"],
      apiOperations[O]["parameters"]["header"],
      apiOperations[O]["parameters"]["cookie"]
    >,
    req: ExpressRequest,
    res: ExpressResponse
  ) => OptionalPromise<HandlerResponse<apiOperations[O]["responses"]>>;
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

export type HandlerResponse<T extends ResponseMap> = ExpressResponse;

export const json = <
  ResMap extends ResponseMap,
  Code extends keyof ResMap & number,
  Content extends ResMap[Code]["content"]["application/json"]
>(
  statusCode: Code,
  res: ExpressResponse,
  json: Content["application/json"] extends never ? {} : Required<Content>
): HandlerResponse<ResMap> => {
  return res.status(statusCode as number).json(json);
};
