import { createAppAuth, createOAuthUserAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";
import { get, getOrCreate, set } from "./cache.ts";

const privateKey = Buffer.from(
  process.env.GITHUB_PRIVATE_KEY,
  "base64",
).toString("utf-8");

const installationIdSymbol = Symbol("installationId");

const githubAuthCache = {
  get: async (key: string) => {
    const value = await get(`github-auth-${key}`);
    if (value) return JSON.parse(value);
    else return undefined;
  },
  set: (key: string, value: any) =>
    set(`github-auth-${key}`, value, 45 * 60 * 1000, false), // Cache authorization tokens for 45 minutes (they expire after 60 minutes)
};

export async function getOctokit(installationId: number) {
  const octokit = new Octokit({
    baseUrl: `${process.env.GITHUB_BASE_URL}/api/v3`,
    authStrategy: createAppAuth,
    auth: {
      privateKey,
      appId: process.env.GITHUB_APP_ID,
      cache: githubAuthCache,
      installationId,
    },
  });

  octokit[installationIdSymbol] = installationId;
  return octokit;
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

async function fetchWithCache<T>(
  octokit: Octokit,
  request: () => Promise<T>,
  key: string,
  ttl = 15,
): Promise<T> {
  if (!octokit[installationIdSymbol]) {
    // The installationId field is required to prevent leaking repos from other installations to ones that don't have access
    throw new Error("Octokit doesn't have installationId field");
  }
  return JSON.parse(
    await getOrCreate(key, ttl, async () => JSON.stringify(await request())),
  ) as T;
}

export async function getRepoById(octokit: Octokit, repoId: number) {
  type Repo = Awaited<ReturnType<typeof octokit.rest.repos.get>>["data"];
  return fetchWithCache<Repo>(
    octokit,
    () =>
      octokit
        .request({
          // This API is undocumented but will likely stick around(?) - https://github.com/piotrmurach/github/issues/283#issuecomment-249092851
          method: "GET",
          url: `/repositories/${repoId}`,
        })
        .then((res) => res.data as Repo),
    `github-repo-${octokit[installationIdSymbol]}-${repoId}`,
  );
}

export async function getWorkflowsByRepoId(octokit: Octokit, repoId: number) {
  type Workflow = Awaited<
    ReturnType<typeof octokit.rest.actions.getWorkflow>
  >["data"];

  return fetchWithCache<Workflow[]>(
    octokit,
    () =>
      octokit
        .request({
          method: "GET",
          url: `/repositories/${repoId}/actions/workflows`,
        })
        .then((res) => res.data.workflows),
    `github-workflows-${octokit[installationIdSymbol]}-${repoId}`,
  );
}

export async function getBranchesByRepoId(octokit: Octokit, repoId: number) {
  type Branch = Awaited<
    ReturnType<typeof octokit.rest.repos.listBranches>
  >["data"][0];
  return fetchWithCache<Branch[]>(
    octokit,
    () =>
      octokit
        .request({
          method: "GET",
          url: `/repositories/${repoId}/branches`,
        })
        .then((res) => res.data),
    `github-branches-${octokit[installationIdSymbol]}-${repoId}`,
  );
}
