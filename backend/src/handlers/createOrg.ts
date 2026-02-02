import { getGitProviderType } from "../lib/git/gitProvider.ts";
import { createOrgService } from "../service/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const createOrgHandler: HandlerMap["createOrg"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const orgName = ctx.request.requestBody.name;
  const result = await createOrgService.createOrg(orgName, req.user.id);

  return json(200, res, {
    id: result.id,
    name: result.name,
    permissionLevel: "OWNER",
    gitProvider: await getGitProviderType(result.id),
  });
};
