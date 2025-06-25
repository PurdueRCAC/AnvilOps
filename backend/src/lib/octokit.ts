import { createOAuthUserAuth } from "@octokit/auth-app";
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

export async function getInstallationAccessToken(octokit: Octokit) {
  const { token } = (await octokit.auth({ type: "installation" })) as any;
  return token as string;
}

export function getUserOctokit(code: string) {
  return new Octokit({
    authStrategy: createOAuthUserAuth,
    auth: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      code: code,
    } satisfies Parameters<typeof createOAuthUserAuth>[0],
    baseUrl: `${process.env.GITHUB_BASE_URL}/api/v3`,
  });
}

export async function getRepoById(octokit: Octokit, repoId: number) {
  const repoResponse = await octokit.request({
    // This API is undocumented but will likely stick around(?) - https://github.com/piotrmurach/github/issues/283#issuecomment-249092851
    method: "GET",
    url: `/repositories/${repoId}`,
  });
  const repo = repoResponse.data as Awaited<
    ReturnType<typeof octokit.rest.repos.get>
  >["data"];

  return repo;
}
