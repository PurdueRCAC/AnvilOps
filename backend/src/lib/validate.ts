import type { Octokit } from "octokit";
import type { components } from "../generated/openapi.ts";
import { namespaceInUse } from "./cluster/kubernetes.ts";
import {
  getNamespace,
  MAX_GROUPNAME_LEN,
  MAX_SUBDOMAIN_LEN,
} from "./cluster/resources.ts";

export function validateDeploymentConfig(
  data: (
    | components["schemas"]["GitDeploymentOptions"]
    | components["schemas"]["ImageDeploymentOptions"]
  ) &
    Omit<components["schemas"]["KnownDeploymentOptions"], "replicas">,
) {
  // TODO verify that the organization has access to the repository

  const { source, env, mounts, port } = data;
  if (source === "git") {
    const { builder, dockerfilePath, rootDir, event, eventId } = data;
    if (rootDir.startsWith("/") || rootDir.includes(`"`)) {
      return { valid: false, message: "Invalid root directory" };
    }
    if (builder === "dockerfile") {
      if (!dockerfilePath) {
        return {
          valid: false,
          message: "Dockerfile path must be provided",
        };
      }
      if (dockerfilePath.startsWith("/") || dockerfilePath.includes(`"`)) {
        return { valid: false, message: "Invalid Dockerfile path" };
      }
    }

    if (event === "workflow_run" && eventId === undefined) {
      return { valid: false, message: "Must provide workflow id" };
    }
  } else if (source === "image") {
    const { imageTag } = data;
    if (
      !imageTag ||
      imageTag.match(
        /^(?:(?=[^:\/]{4,253})(?!-)[a-zA-Z0-9\-]{1,63}(?<!-)(?:\.(?!-)[a-zA-Z0-9\-]{1,63}(?<!-))*(?::[0-9]{1,5})?\/)?((?![._\-])(?:[a-z0-9._\-]*)(?<![._\-])(?:\/(?![._\-])[a-z0-9._\-]*(?<![._\-]))*)(?::(?![.\-])[a-zA-Z0-9_.\-]{1,128})?$/,
      ) === null
    ) {
      return {
        valid: false,
        message: "Invalid image tag",
      };
    }
  } else {
    return {
      valid: false,
      message: "Invalid deployment source type: expected `git` or `image`.",
    };
  }

  if (port < 0 || port > 65535) {
    return {
      valid: false,
      message: "Invalid port number",
    };
  }

  try {
    validateEnv(env);
  } catch (err) {
    return { valid: false, message: err.message };
  }

  // TODO validate mounts

  return { valid: true };
}

export const validateAppGroup = (
  appGroup: components["schemas"]["NewApp"]["appGroup"],
) => {
  if (appGroup.type === "create-new") {
    if (
      appGroup.name.length > MAX_GROUPNAME_LEN ||
      appGroup.name.match(/^[a-zA-Z0-9][ a-zA-Z0-9-_\.]*$/) === null
    ) {
      return {
        valid: false,
        message: "Invalid group name",
      };
    }
  }
  return { valid: true };
};

export const validateEnv = (env: DeploymentJson.EnvVar[]) => {
  if (env?.some((it) => !it.name || it.name.length === 0)) {
    throw new Error("Some environment variable(s) are empty");
  }

  const envNames = new Set();

  for (let envVar of env) {
    if (envNames.has(envVar.name)) {
      throw new Error("Duplicate environment variable " + envVar.name);
    }
    envNames.add(envVar.name);
  }
};

export const validateSubdomain = async (subdomain: string) => {
  if (subdomain.length > MAX_SUBDOMAIN_LEN || !validateRFC1123(subdomain)) {
    return { valid: false, message: `Invalid subdomain ${subdomain}` };
  }

  if (await namespaceInUse(getNamespace(subdomain))) {
    return { valid: false, message: `Subdomain ${subdomain} is unavailable` };
  }

  return { valid: true };
};

export const validateRFC1123 = (value: string) =>
  value.length <= 63 &&
  value.match(/[a-zA-Z0-9]([-a-z0-9]*[a-z0-9])?$/) !== null;
