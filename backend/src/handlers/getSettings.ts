import fs from "fs";
import { isRancherManaged } from "../lib/cluster/rancher.ts";
import { env } from "../lib/env.ts";
import { json, type HandlerMap } from "../types.ts";

type ClusterConfig = {
  name?: string;
  faq?: {
    question?: string;
    answer?: string;
    link?: string;
  };
};
let clusterConfig: null | ClusterConfig = null;
const configPath =
  env["NODE_ENV"] === "development"
    ? "./cluster.local.json"
    : env.CLUSTER_CONFIG_PATH;
if (configPath) {
  clusterConfig = JSON.parse(fs.readFileSync(configPath).toString());
}

export const getSettings: HandlerMap["getSettings"] = (ctx, req, res) => {
  return json(200, res, {
    appDomain: env.APP_DOMAIN,
    clusterName: clusterConfig?.name,
    faq: clusterConfig?.faq,
    storageEnabled: env.STORAGE_CLASS_NAME !== undefined,
    isRancherManaged: isRancherManaged(),
  });
};
