import express from "express";
import { existsSync, statSync } from "node:fs";

const app = express();
const port = 3000;

if (existsSync("./public") && statSync("./public").isDirectory()) {
  console.log("Serving static files from ./public");
  app.use(express.static("./public"));
}

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
