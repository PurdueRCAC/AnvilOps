import addFormats from "ajv-formats";
import {
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from "express";
import path from "node:path";
import { OpenAPIBackend, type Request } from "openapi-backend";
import { handlers } from "../handlers/index.ts";

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
