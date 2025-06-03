import { redirect, type HandlerMap } from "../types.ts";

/**
 * This endpoint is called after the user authorizes the GitHub App on their user account or organization.
 */
export const githubCallback: HandlerMap["githubCallback"] = (ctx, req, res) => {
  return redirect(302, res, "/projects");
};
