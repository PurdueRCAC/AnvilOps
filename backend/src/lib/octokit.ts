import { createAppAuth, createOAuthUserAuth } from "@octokit/auth-app";
import { Octokit, RequestError } from "octokit";
import { get, getOrCreate, set } from "./cache.ts";
import { db } from "./db.ts";

const privateKey = Buffer.from(
  process.env.GITHUB_PRIVATE_KEY,
  "base64",
).toString("utf-8");

const installationIdSymbol = Symbol("installationId");

const githubAuthCache = {
  get: async (key: string) => get(`github-auth-${key}`),
  set: (key: string, value: any) =>
    set(`github-auth-${key}`, value, 45 * 60, false), // Cache authorization tokens for 45 minutes (they expire after 60 minutes)
};

export class InstallationNotFoundError extends Error {
  constructor(cause: unknown) {
    super("GitHub App installation not found", { cause });
  }
}

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
  try {
    // Run the authorization step right now so that we can rethrow if the installation wasn't found
    await octokit.auth({ type: "installation" });
  } catch (e) {
    if ((e as RequestError)?.status === 404) {
      // Installation not found. Remove it from its organization(s).
      await db.organization.updateMany({
        where: { githubInstallationId: installationId },
        data: { githubInstallationId: null },
      });
      throw new InstallationNotFoundError(e);
    }
    throw e;
  }
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

export async function getRepoById(octokit: Octokit, repoId: number) {
  type Repo = Awaited<ReturnType<typeof octokit.rest.repos.get>>["data"];
  if (!octokit[installationIdSymbol]) {
    // The installationId field is required to prevent leaking repos from other installations to ones that don't have access
    throw new Error("Octokit doesn't have installationId field");
  }
  return JSON.parse(
    await getOrCreate(
      `github-repo-${octokit[installationIdSymbol]}-${repoId}`,
      15,
      async () => {
        const repoResponse = await octokit.request({
          // This API is undocumented but will likely stick around(?) - https://github.com/piotrmurach/github/issues/283#issuecomment-249092851
          method: "GET",
          url: `/repositories/${repoId}`,
        });
        const repo = repoResponse.data as Repo;

        return JSON.stringify(repo);
      },
    ),
  ) as Repo;
}
