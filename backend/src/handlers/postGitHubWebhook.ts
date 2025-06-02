import { Webhooks } from "@octokit/webhooks";
import { json, type HandlerMap } from "../types.ts";

const webhooks = new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET });

export const postGitHubWebhook: HandlerMap["postGitHubWebhook"] = async (
  ctx,
  req,
  res
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
  const action = ctx.request.body["action"];

  switch (requestType) {
    case "repository": {
      switch (action) {
        case "renamed": {
          // TODO
        }
        case "transferred": {
          // TODO
        }
        case "deleted": {
          // TODO
        }
        default: {
          return json(422, res, {});
        }
      }
    }
    case "installation": {
      switch (action) {
        case "created": {
          // TODO
        }
        case "deleted": {
          // TODO
        }
        default: {
          return json(422, res, {});
        }
      }
    }
    case "push": {
      // TODO
    }
    default: {
      return json(422, res, {});
    }
  }

  return json(200, res, {});
};
