import type { Span } from "@opentelemetry/api";
import {
  type Request as ExpressRequest,
  type Response as ExpressResponse,
  type NextFunction,
} from "express";
import type { Context } from "openapi-backend";
import type { operations } from "./generated/openapi.ts";
import type { AuthenticatedRequest } from "./handlers/index.ts";
import type { ALLOWED_ANONYMOUS_ROUTES } from "./lib/auth.ts";

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

type NonNeverOr<Input, Fallback> = [Input] extends [never] ? Fallback : Input;
type EmptyObject = Record<never, never>;

// If we don't remap `never`s to something else, the TypeScript compiler will report an error when trying to cast our `HandlerMap` type to openapi-backend's HandlerMap type
// Wrapping all the generic type parameters of `Context` with `OrEmpty<...>` makes it so that it satisfies openapi-backend's Handler type while also accomplishing our goal of making the result unusable within handler functions.
type OrEmpty<Input> = NonNeverOr<Input, EmptyObject>;

export type Handler<O extends keyof apiOperations> = (
  ctx: Context<
    OrEmpty<ValuesOf<apiOperations[O]["requestBody"]["content"]>>,
    OrEmpty<apiOperations[O]["parameters"]["path"]>,
    OrEmpty<apiOperations[O]["parameters"]["query"]>,
    OrEmpty<TransformHeaders<apiOperations[O]["parameters"]["header"]>>,
    OrEmpty<apiOperations[O]["parameters"]["cookie"]>
  >,
  req: O extends keyof typeof ALLOWED_ANONYMOUS_ROUTES
    ? ExpressRequest
    : AuthenticatedRequest,
  res: HandlerResponse<apiOperations[O]["responses"]>,
  next: NextFunction,
) => OptionalPromise<HandlerResponse<apiOperations[O]["responses"]>>;

export type HandlerMap = {
  [O in keyof apiOperations]: Handler<O>;
};

type ResponseType = number | "default";
export type ResponseMap = {
  [statusCode in ResponseType]?: {
    headers: { [name: string]: unknown };
    content?: {
      "application/json"?: unknown;
      "text/event-stream"?: unknown;
      "application/octet-stream"?: unknown;
    };
  };
};

export type HandlerResponse<T extends ResponseMap> = ExpressResponse & {
  _internal_do_not_use_responseMap?: T;
};

export const json = <
  ResMap extends ResponseMap,
  Code extends keyof ResMap & number,
>(
  statusCode: Code,
  res: HandlerResponse<ResMap>,
  json: ResMap[Code] extends { content: { "application/json": infer T } }
    ? T
    : never,
): HandlerResponse<ResMap> => {
  return res.status(statusCode as number).json(json);
};

export const empty = <
  ResMap extends ResponseMap,
  Code extends keyof ResponseMap & number,
>(
  statusCode: [ResMap[Code]["content"]] extends [never]
    ? Code
    : "Error: This status code expects a body in the OpenAPI spec. Use json() instead.",
  res: HandlerResponse<ResMap>,
): HandlerResponse<ResMap> => {
  return res.status(statusCode as unknown as number).end();
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

export const unsafeGenericResponse = <ResMap extends ResponseMap>(
  res: ExpressResponse,
): HandlerResponse<ResMap> => {
  return res;
};

declare module "http" {
  interface IncomingMessage {
    _otel_root_span: Span; // See instrumentation.ts
  }
}

declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      name: string;
      email: string;
    };
  }
}
