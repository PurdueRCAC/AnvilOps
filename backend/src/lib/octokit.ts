import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";

const privateKey = Buffer.from(
  process.env.GITHUB_PRIVATE_KEY,
  "base64"
).toString("utf-8");

export function getOctokit(installationId: number) {
  return new Octokit({
    baseUrl: `${process.env.GITHUB_BASE_URL}/api/v3`,
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_CLIENT_ID,
      privateKey,
      installationId,
    },
  });
}
