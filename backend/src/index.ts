import express, { type Response as ExpressResponse } from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { OpenAPIBackend, type Context, type Request } from "openapi-backend";
import { type operations } from "./generated/openapi.ts";

const app = express();
const port = 3000;

const publicDir = path.resolve(path.dirname(import.meta.dirname), "public");

const apiSpecPath = path.resolve(
  path.dirname(path.dirname(import.meta.dirname)),
  "openapi",
  "openapi.yaml"
);

app.use("/openapi.yaml", express.static(apiSpecPath));

app.use(/^\/api\//, (req, res) => {
  api.handleRequest(req as Request, req, res);
});

if (existsSync(publicDir) && statSync(publicDir).isDirectory()) {
  console.log("Serving static files from", publicDir);
  const index = path.resolve(publicDir, "index.html");

  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      req.accepts("html")
    ) {
      res.sendFile(index, (err) => err && next());
    } else {
      next();
    }
  });
}

type OptionalPromise<T> = T | Promise<T>;
type HandlerMap = {
  [O in keyof operations]: (
    req: Context<
      operations[O]["requestBody"],
      operations[O]["parameters"]["path"],
      operations[O]["parameters"]["query"],
      operations[O]["parameters"]["header"],
      operations[O]["parameters"]["cookie"]
    >,
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
  Content extends ResMap[Code] extends never
    ? ResMap["default"]["content"]["application/json"]
    : ResMap[Code]["content"]["application/json"]
>(
  statusCode: Code,
  res: ExpressResponse,
  json: Content extends never ? {} : Required<Content>
): HandlerResponse<ResMap> => {
  return res.status(statusCode as number).json(json);
};

const handlers = {
  // TODO
} satisfies HandlerMap;

const api = new OpenAPIBackend({
  definition: apiSpecPath,
  handlers,
});

app.use((req, res) => {
  api.handleRequest(req as Request, req, res);
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
