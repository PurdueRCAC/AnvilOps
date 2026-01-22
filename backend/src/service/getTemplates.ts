import { readFile } from "node:fs/promises";
import type { paths } from "../generated/openapi.ts";
import { env } from "../lib/env.ts";

const path =
  env.NODE_ENV === "development"
    ? "../templates/templates.json"
    : "./templates.json";

type Template =
  paths["/templates"]["get"]["responses"]["200"]["content"]["application/json"][0];

const templatesPromise = readFile(path, "utf8").then(
  (file) => JSON.parse(file.toString()) as Record<string, Template>,
);

export async function getTemplates() {
  return await templatesPromise;
}
