import { Webhooks } from "@octokit/webhooks";
import { json, type HandlerMap } from "../types.ts";

const webhooks = new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET });

export const postGitHubWebhook: HandlerMap["postGitHubWebhook"] = (
  req,
  res
) => {
  const signature = req.request.headers["X-Hub-Signature-256"];
  console.log(signature, req.request.body.req.request.requestBody);

  return json(200, res, {});
};
