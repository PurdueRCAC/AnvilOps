import { db } from "../lib/db.ts";
import { getOctokit } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";

export const updateDeployment: HandlerMap["updateDeployment"] = async (
  ctx,
  req,
  res,
) => {
  const { secret, status } =
    ctx.request.requestBody.content["application/json"];

  if (!secret) {
    return json(401, res, {});
  }

  if (!(status in ["BUILDING", "DEPLOYING", "ERROR"]))
    return json(400, res, {});

  const deployment = await db.deployment.update({
    where: { secret: secret },
    data: { status: status as "BUILDING" | "DEPLOYING" | "ERROR" },
    include: {
      app: { include: { org: { select: { githubInstallationId: true } } } },
    },
  });

  if (!deployment) {
    return json(403, res, {});
  }

  if (status === "DEPLOYING" || status === "ERROR") {
    // The build completed. Update the check run with the result of the build (success or failure).
    const octokit = getOctokit(deployment.app.org.githubInstallationId);

    // Get the repo's name and owner from its ID, just in case the name or owner changed in the middle of the deployment
    const repoResponse = await octokit.request({
      // This API is undocumented but will likely stick around(?) - https://github.com/piotrmurach/github/issues/283#issuecomment-249092851
      method: "GET",
      url: `/repositories/${deployment.app.repositoryId}`,
    });
    const repo = repoResponse.data as Awaited<
      ReturnType<typeof octokit.rest.repos.get>
    >["data"];

    await octokit.rest.checks.update({
      check_run_id: deployment.checkRunId,
      status: "completed",
      conclusion: status === "DEPLOYING" ? "success" : "failure",
      owner: repo.owner.login,
      repo: repo.name,
    });
  }

  return json(200, res, {});
};
