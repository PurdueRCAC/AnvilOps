import { Webhooks } from "@octokit/webhooks";
import { env } from "../lib/env.ts";
import {
  AppNotFoundError,
  UnknownWebhookRequestTypeError,
  ValidationError,
} from "../service/common/errors.ts";
import { processGitHubWebhookPayload } from "../service/githubWebhook.ts";
import { json, type HandlerMap } from "../types.ts";

const webhooks = new Webhooks({ secret: env.GITHUB_WEBHOOK_SECRET });

export const githubWebhookHandler: HandlerMap["githubWebhook"] = async (
  ctx,
  req,
  res,
) => {
  const signature = ctx.request.headers["x-hub-signature-256"];
  const data = req.body as string;

  if (!signature) {
    return json(401, res, {});
  }

  const isValid = await webhooks.verify(data, signature);
  if (!isValid) {
    return json(403, res, {});
  }

  const requestType = ctx.request.headers["x-github-event"];
  const action =
    "action" in ctx.request.requestBody
      ? ctx.request.requestBody["action"]
      : null;

  try {
    await processGitHubWebhookPayload(requestType, action, JSON.parse(data));
    return json(200, res, {});
  } catch (e) {
    if (e instanceof ValidationError) {
      return json(400, res, { code: 400, message: e.message });
    } else if (e instanceof AppNotFoundError) {
      // GitHub sent a webhook about a repository, but it's not linked to any apps - nothing to do here
      return json(200, res, {});
    } else if (e instanceof UnknownWebhookRequestTypeError) {
      // GitHub sent a webhook payload that we don't care about
      return json(422, res, {});
    }
    throw e;
  }
};
