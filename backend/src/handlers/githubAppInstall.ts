import { redirect, type HandlerMap } from "../types.ts";

export const githubAppInstall: HandlerMap["githubAppInstall"] = (
  ctx,
  req,
  res
) => {
  // TODO: add a URL parameter to this API route containing the organization to authorize the app for. Then, add it as the `state` URL parameter in the URL below and look for the `state` in the callback URL when copying the installation ID to a team.
  return redirect(
    302,
    res,
    `${process.env.GITHUB_BASE_URL}/github-apps/${process.env.GITHUB_APP_NAME}/installations/new`
  );
};
