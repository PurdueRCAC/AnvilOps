import { readFile } from "node:fs/promises";
import type { paths } from "../generated/openapi.ts";

type Template =
  paths["/templates"]["get"]["responses"]["200"]["content"]["application/json"][0];

export class GetTemplatesService {
  private templatesPromise: Promise<Record<string, Template>>;

  constructor(templateFilePath: string) {
    this.templatesPromise = readFile(templateFilePath, "utf8").then(
      (file) => JSON.parse(file.toString()) as Record<string, Template>,
    );
  }

  async getTemplates() {
    return await this.templatesPromise;
  }
}
