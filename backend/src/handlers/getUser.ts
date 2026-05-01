import { getUserService } from "../service/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getUserHandler: HandlerMap["getUser"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const user = await getUserService.getUser(req.user.id);
  return json(200, res, { ...user, csrfToken: req.user.csrfToken });
};
