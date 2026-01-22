import { trace, type Span } from "@opentelemetry/api";
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

    methodNotAllowed: (ctx, req: ExpressRequest, res: ExpressResponse) => {
      return res.status(405).json({ code: 405, message: "Method not allowed" });
    },

    notFound: (ctx, req: ExpressRequest, res: ExpressResponse) => {
      return res.status(404).json({ code: 404, message: "No such method" });
    },

    validationFail: (ctx, req: ExpressRequest, res: ExpressResponse) => {
      return res.status(400).json({
        code: 400,
        message: "Request validation failed",
        errors: ctx.validation.errors,
      });
    },

    preOperationHandler: (ctx, req: ExpressRequest) => {
      const span = trace.getActiveSpan();
      if (span) {
        span.setAttribute("http.operation.id", ctx?.operation?.operationId);
        span.setAttribute("http.route", ctx?.operation?.path);
      }
      const rootSpan = req["_otel_root_span"] as Span; // This property is set in src/instrumentation.ts when a request is received
      if (rootSpan) {
        const spanEnd = rootSpan.end.bind(rootSpan);
        rootSpan.end = (input) => {
          // We need to override the span's `end` function because, if we didn't, the auto-instrumentation would update the name right before the span is closed.

          // Update the span's http.route and name to use the URL patterns that openapi-backend parsed from the request.
          // Without this, the span title would just be `/api` instead of the actual path.
          rootSpan.setAttribute("http.route", "/api" + ctx?.operation?.path);
          rootSpan.updateName(
            `${req.method?.toUpperCase()} /api${ctx?.operation?.path}`,
          );
          spanEnd(input);
        };
      }
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

await api.init();

export default async function handler(
  req: ExpressRequest,
  res: ExpressResponse,
) {
  try {
    await api.handleRequest(req as Request, req, res);
  } catch (err) {
    if (err instanceof URIError) {
      res.status(400).json({ code: 400, message: "Malformed URI." });
    }
    throw err;
  }
}
