import express from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const app = express();
const port = 3000;

if (existsSync("./public") && statSync("./public").isDirectory()) {
  console.log("Serving static files from ./public");
  const index = path.resolve(import.meta.dirname, "public/index.html");

  app.use(express.static("./public"));
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
