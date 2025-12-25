import { getUser } from "../service/getUser.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getUserHandler: HandlerMap["getUser"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const user = await getUser(req.user.id);
  return json(200, res, user);
};
