import { Webhooks } from "@octokit/webhooks";
import { json, type HandlerMap } from "../types.ts";

const webhooks = new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET });

export const postGitHubWebhook: HandlerMap["postGitHubWebhook"] = (
  ctx,
  req,
  res
) => {
  const signature = ctx.request.headers["X-Hub-Signature-256"];
  console.log(signature, ctx.request.requestBody);

  return json(200, res, {});
};
