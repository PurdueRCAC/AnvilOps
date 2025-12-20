import { env } from "./env.ts";

export async function deleteRepo(name: string) {
  const headers = {
    authorization: `Basic ${Buffer.from(env.DELETE_REPO_USERNAME + ":" + env.DELETE_REPO_PASSWORD).toString("base64")}`,
  };

  let host = env.DELETE_REPO_HOST;
  if (!host.startsWith("http://") && !host.startsWith("https://")) {
    host = "https://" + host;
  }

  await fetch(
    `${env.REGISTRY_API_URL}/projects/${env.HARBOR_PROJECT_NAME}/repositories/${name}`,
    {
      method: "DELETE",
      headers,
    },
  ).then((response) => {
    if (!response.ok && response.status !== 404) {
      // ^ 404 means the repository doesn't exist, so it has already been deleted or was never created
      throw new Error(response.statusText);
    }
  });
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
  return fetch(`${env.REGISTRY_API_URL}/projects/${projectName}/repositories`)
    .then((res) => res.text())
    .then((res) => JSON.parse(res))
    .then((res) => {
      if ("errors" in res) {
        throw res;
      }
      return res as HarborRepository[];
    });
}
