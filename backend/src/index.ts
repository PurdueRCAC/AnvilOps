import express from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { OpenAPIBackend, type Request } from "openapi-backend";
import addFormats from "ajv-formats";
import handlers from "./lib/handlers.ts";

const app = express();
app.use(express.json());
const port = 3000;

const api = new OpenAPIBackend({
  definition: path.resolve(
    path.dirname(path.dirname(import.meta.dirname)),
    "openapi",
    "openapi.yaml"
  ),
  handlers,
  ajvOpts: { coerceTypes: "array" },
  customizeAjv: (ajv) => {
    addFormats(ajv, { mode: 'fast', formats: ['email', 'uri', 'date-time', 'uuid', 'int64']});
    return ajv;
  }
});

app.use("/api", (req, res) => {
  api.handleRequest(req as Request, req, res);
});

const publicDir = path.resolve(path.dirname(import.meta.dirname), "public");
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

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
