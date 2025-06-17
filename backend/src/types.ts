import {
  type Request as ExpressRequest,
  type Response as ExpressResponse,
  type NextFunction,
} from "express";
import type { Context } from "openapi-backend";
import type { operations } from "./generated/openapi.ts";

export type OptionalPromise<T> = T | Promise<T>;
type apiOperations = {
  [K in keyof operations as K extends `auth${string}`
    ? never
    : K]: operations[K];
};

// Transform all headers to be lowercase - this is expected in HTTP/2 and it seems like something is transforming them to be lowercase even on HTTP/1.1
type TransformHeaders<HeadersIn extends Record<string, string>> = {
  [H in keyof HeadersIn as Lowercase<string & H>]: HeadersIn[H];
};

type ValuesOf<T> = T[keyof T];

export type HandlerMap = {
  [O in keyof apiOperations]: (
    ctx: Context<
      ValuesOf<apiOperations[O]["requestBody"]["content"]>,
      apiOperations[O]["parameters"]["path"],
      apiOperations[O]["parameters"]["query"],
      TransformHeaders<apiOperations[O]["parameters"]["header"]>,
      apiOperations[O]["parameters"]["cookie"]
    >,
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction,
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
  Content extends ResMap[Code]["content"]["application/json"],
>(
  statusCode: Code,
  res: ExpressResponse,
  json: Content["application/json"] extends never ? {} : Required<Content>,
): HandlerResponse<ResMap> => {
  return res.status(statusCode as number).json(json);
};

export const redirect = <
  ResMap extends ResponseMap,
  Code extends keyof ResMap & (301 | 302 | 307 | 308),
>(
  statusCode: Code,
  res: ExpressResponse,
  url: string,
): HandlerResponse<ResMap> => {
  res.redirect(statusCode, url);
  return res;
};

export type Env = {
  name: string;
  value: string;
};

export const isObjectEmpty = (obj: {}) =>
  obj && Object.keys(obj).length === 0 && obj.constructor === Object;
