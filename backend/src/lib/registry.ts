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
    `${host}/api/v2.0/projects/${env.HARBOR_PROJECT_NAME}/repositories/${name}`,
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
