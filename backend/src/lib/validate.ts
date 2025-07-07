import type { components } from "../generated/openapi.ts";
import {
  getNamespace,
  MAX_GROUPNAME_LEN,
  MAX_SUBDOMAIN_LEN,
  namespaceInUse,
} from "./kubernetes.ts";

export function validateDeploymentConfig(appData: {
  source?: "git" | "image";
  builder?: "dockerfile" | "railpack";
  rootDir: string;
  env?: components["schemas"]["Envs"];
  mounts: components["schemas"]["Mount"][];
  port: number;
  dockerfilePath?: string;
  imageTag?: string;
  secrets?: components["schemas"]["Envs"];
  appGroup:
    | {
        type: "standalone";
      }
    | {
        type: "create-new";
        name: string;
      }
    | {
        type: "add-to";
        id: number;
      };
}) {
  // TODO verify that the organization has access to the repository

  if (appData.source === "git") {
    if (appData.rootDir.startsWith("/") || appData.rootDir.includes(`"`)) {
      return { valid: false, message: "Invalid root directory" };
    }
    if (appData.builder === "dockerfile") {
      if (!appData.dockerfilePath) {
        return {
          valid: false,
          message: "Dockerfile path must be provided",
        };
      }
      if (
        appData.dockerfilePath.startsWith("/") ||
        appData.dockerfilePath.includes(`"`)
      ) {
        return { valid: false, message: "Invalid Dockerfile path" };
      }
    }
  } else if (appData.source === "image") {
    if (!appData.imageTag) {
      // TODO validate image tag format
      return {
        valid: false,
        message: "Image tag must be provided",
      };
    }
  } else {
    return {
      valid: false,
      message: "Invalid deployment source type: expected `git` or `image`.",
    };
  }

  if (appData.env?.some((it) => !it.name || it.name.length === 0)) {
    return {
      valid: false,
      message: "Some environment variable(s) are empty",
    };
  }

  if (appData.port < 0 || appData.port > 65535) {
    return {
      valid: false,
      message: "Invalid port number",
    };
  }

  if (appData.appGroup.type === "create-new") {
    if (
      appData.appGroup.name.length > MAX_GROUPNAME_LEN ||
      appData.appGroup.name.match(/^[a-zA-Z0-9][ a-zA-Z0-9-_\.]*$/) === null
    ) {
      return {
        valid: false,
        message: "Invalid group name",
      };
    }
  }

  try {
    validateEnv(appData.env);
  } catch (err) {
    return { valid: false, message: err.message };
  }

  // TODO validate mounts

  return { valid: true };
}

export const validateEnv = (env: PrismaJson.EnvVar[]) => {
  const envNames = new Set();
  for (let envVar of env) {
    if (envNames.has(envVar.name)) {
      throw new Error("Duplicate environment variable " + envVar.name);
    }
    envNames.add(envVar.name);
  }
};

export const validateSubdomain = async (subdomain: string) => {
  if (
    subdomain.length > MAX_SUBDOMAIN_LEN ||
    subdomain.match(/^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/) == null
  ) {
    return { valid: false, message: `Invalid subdomain ${subdomain}` };
  }

  if (await namespaceInUse(getNamespace(subdomain))) {
    return { valid: false, message: `Subdomain ${subdomain} is unavailable` };
  }

  return { valid: true };
};
