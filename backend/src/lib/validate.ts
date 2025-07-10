import type { components } from "../generated/openapi.ts";
import {
  getNamespace,
  MAX_GROUPNAME_LEN,
  MAX_SUBDOMAIN_LEN,
  namespaceInUse,
} from "./kubernetes.ts";

export function validateDeploymentConfig(
  data: Pick<
    components["schemas"]["NewApp"],
    | "source"
    | "builder"
    | "rootDir"
    | "env"
    | "mounts"
    | "port"
    | "dockerfilePath"
    | "imageTag"
    | "appGroup"
    | "event"
    | "eventId"
  >,
) {
  // TODO verify that the organization has access to the repository

  const {
    source,
    builder,
    rootDir,
    env,
    mounts,
    port,
    dockerfilePath,
    imageTag,
    appGroup,
    event,
    eventId,
  } = data;
  if (source === "git") {
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

  if (env?.some((it) => !it.name || it.name.length === 0)) {
    return {
      valid: false,
      message: "Some environment variable(s) are empty",
    };
  }

  if (port < 0 || port > 65535) {
    return {
      valid: false,
      message: "Invalid port number",
    };
  }

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

  try {
    validateEnv(env);
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
