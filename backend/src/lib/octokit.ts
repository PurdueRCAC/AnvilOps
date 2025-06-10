import { App, Octokit } from "octokit";

const privateKey = Buffer.from(
  process.env.GITHUB_PRIVATE_KEY,
  "base64",
).toString("utf-8");

export async function getOctokit(installationId: number) {
  const app = new App({
    Octokit: Octokit.defaults({
      baseUrl: `${process.env.GITHUB_BASE_URL}/api/v3`,
    }),
    appId: process.env.GITHUB_APP_ID,
    privateKey,
  });

  return await app.getInstallationOctokit(installationId);
}
