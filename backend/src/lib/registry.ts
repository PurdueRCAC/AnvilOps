import { logger } from "../index.ts";
import { env } from "./env.ts";

export async function fetchFromRegistry(path: string, init?: RequestInit) {
  return await fetch(
    `${env.REGISTRY_PROTOCOL}://${env.REGISTRY_HOSTNAME}/${path}`,
    init,
  );
}

export async function deleteRepo(name: string) {
  logger.info({ name }, "Deleting image repository");
  const headers = {
    authorization: `Basic ${Buffer.from(env.DELETE_REPO_USERNAME + ":" + env.DELETE_REPO_PASSWORD).toString("base64")}`,
  };

  await fetchFromRegistry(
    `api/v2.0/projects/${env.HARBOR_PROJECT_NAME}/repositories/${name}`,
    {
      method: "DELETE",
      headers,
    },
  );
}

type HarborRepository = {
  artifact_count: number;
  creation_time: string;
  id: number;
  name: string;
  project_id: number;
  pull_count: number;
  update_time: string;
};

export async function getRepositoriesByProject(projectName: string) {
  const response = await fetchFromRegistry(
    `api/v2.0/projects/${projectName}/repositories`,
  );

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  return (await response.json()) as HarborRepository[];
}
