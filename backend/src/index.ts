import express from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const app = express();
const port = 3000;

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
