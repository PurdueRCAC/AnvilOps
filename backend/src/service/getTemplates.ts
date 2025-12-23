import { readFile } from "node:fs/promises";
import { env } from "../lib/env.ts";

const path =
  env.NODE_ENV === "development"
    ? "../templates/templates.json"
    : "./templates.json";

const templatesPromise = readFile(path, "utf8").then((file) =>
  JSON.parse(file.toString()),
);

export async function getTemplates() {
  return await templatesPromise;
}
