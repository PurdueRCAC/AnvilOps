import fs from "node:fs";
import { json, type HandlerMap } from "../types.ts";

export const getTemplates: HandlerMap["getTemplates"] = async (
  ctx,
  req,
  res,
) => {
  const path =
    process.env.NODE_ENV === "development"
      ? "../templates/templates.json"
      : "./templates.json";
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  return json(200, res, data);
};
