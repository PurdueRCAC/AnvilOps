import type { components } from "../generated/openapi.ts";
import { namespaceInUse } from "./cluster/kubernetes.ts";
import {
  getNamespace,
  MAX_GROUPNAME_LEN,
  MAX_STS_NAME_LEN,
  MAX_SUBDOMAIN_LEN,
} from "./cluster/resources.ts";
import { getImageConfig, parseImageRef } from "./cluster/resources/logs.ts";

export async function validateDeploymentConfig(
  data: (
    | components["schemas"]["GitDeploymentOptions"]
    | components["schemas"]["ImageDeploymentOptions"]
  ) &
    Omit<components["schemas"]["KnownDeploymentOptions"], "replicas">,
) {
  const { source, env, mounts, port } = data;
  if (source === "git") {
    const { builder, dockerfilePath, rootDir, event, eventId } = data;
    if (rootDir.startsWith("/") || rootDir.includes(`"`)) {
      throw new Error("Invalid root directory");
    }
    if (builder === "dockerfile") {
      if (!dockerfilePath) {
        throw new Error("Dockerfile path is required");
      }
      if (dockerfilePath.startsWith("/") || dockerfilePath.includes(`"`)) {
        throw new Error("Invalid Dockerfile path");
      }
    }

    if (event === "workflow_run" && eventId === undefined) {
      throw new Error("Workflow ID is required");
    }
  } else if (source === "image") {
    if (!data.imageTag) {
      throw new Error("Image tag is required");
    }
  } else {
    throw new Error(
      "Invalid deployment source type: expected `git` or `image`.",
    );
  }

  if (port < 0 || port > 65535) {
    throw new Error("Invalid port number: must be between 0 and 65535");
  }

  validateEnv(env);

  validateMounts(mounts);

  if (data.source === "image") {
    await validateImageReference(data.imageTag);
  }
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

const validateMounts = (
  mounts: components["schemas"]["KnownDeploymentOptions"]["mounts"],
) => {
  const pathSet = new Set();
  for (const mount of mounts) {
    if (!mount.path.startsWith("/")) {
      throw new Error(`Invalid mount path ${mount.path}: must start with '/'`);
    }

    if (pathSet.has(mount.path)) {
      throw new Error(`Invalid mounts: paths are not unique`);
    }
    pathSet.add(mount.path);
  }
};

export const validateEnv = (env: PrismaJson.EnvVar[]) => {
  if (env?.some((it) => !it.name || it.name.length === 0)) {
    return { valid: false, message: "Some environment variable(s) are empty" };
  }

  if (env?.some((it) => it.name.startsWith("_PRIVATE_ANVILOPS_"))) {
    // Environment variables with this prefix are used in the log shipper - see log-shipper/main.go
    return {
      valid: false,
      message:
        'Environment variable(s) use reserved prefix "_PRIVATE_ANVILOPS_"',
    };
  }

  const envNames = new Set();

  for (let envVar of env) {
    if (envNames.has(envVar.name)) {
      return {
        valid: false,
        message: "Duplicate environment variable " + envVar.name,
      };
    }
    envNames.add(envVar.name);
  }
};

export const validateSubdomain = async (subdomain: string) => {
  if (subdomain.length > MAX_SUBDOMAIN_LEN || !isRFC1123(subdomain)) {
    throw new Error(
      "Subdomain must contain only lowercase alphanumeric characters or '-', " +
        "start and end with an alphanumeric character, " +
        `and contain at most ${MAX_SUBDOMAIN_LEN} characters`,
    );
  }

  if (await namespaceInUse(getNamespace(subdomain))) {
    throw new Error("Subdomain is unavailable");
  }

  return { valid: true };
};

export const validateImageReference = async (reference: string) => {
  let imageInfo: ReturnType<typeof parseImageRef>;
  try {
    imageInfo = parseImageRef(reference);
  } catch {
    throw new Error("Invalid image reference.");
  }

  try {
    // Look up the image in its registry to make sure it exists
    await getImageConfig(imageInfo);
  } catch (e) {
    console.error(e);
    throw new Error("Image could not be found in its registry.");
  }
};

export const validateAppName = (name: string) => {
  if (name.length > MAX_STS_NAME_LEN || !isRFC1123(name)) {
    throw new Error(
      "App name must contain only lowercase alphanumeric characters or '-', " +
        "start and end with an alphanumeric character, " +
        `and contain at most ${MAX_STS_NAME_LEN} characters`,
    );
  }
};

export const isRFC1123 = (value: string) =>
  value.length <= 63 &&
  value.match(/[a-zA-Z0-9]([-a-z0-9]*[a-z0-9])?$/) !== null;
