import type { V1PodTemplateSpec } from "@kubernetes/client-node";
import { env } from "../../env.ts";

type ImageConfig = {
  architecture: string;
  config: {
    /**
     * @example {"80/tcp":{}}
     */
    ExposedPorts: Record<string, {}>;
    Env: Array<string>;
    Entrypoint: Array<string>;
    Cmd: Array<string>;
    Labels: Record<string, string>;
    StopSignal: string;
  };
  created: string;
  history: Array<{
    created: string;
    created_by: string;
    comment: string;
    empty_layer?: boolean;
  }>;
  os: string;
  rootfs: {
    type: string;
    diff_ids: Array<string>;
  };
};

export async function wrapWithLogExporter<T extends V1PodTemplateSpec>(
  logType: "build" | "runtime",
  logIngestToken: string,
  deploymentId: number,
  spec: T,
): Promise<T> {
  const clone = structuredClone(spec);

  // Return a new spec that wraps the old one with with these modifications:
  // - Copy the log shipper from an initContainer
  // - Update the main container's entrypoint and command
  // - Add environment variables that the log shipper needs

  // Create an EmptyDir mount to share files between the InitContainer and the main container
  if (!clone.spec.volumes) {
    clone.spec.volumes = [];
  }
  clone.spec.volumes.push({
    name: "anvilops-log-shipper-binary",
    emptyDir: {},
  });

  // Create an initContainer to copy the log shipper binary into the shared volume
  if (!clone.spec.initContainers) {
    clone.spec.initContainers = [];
  }
  clone.spec.initContainers.push({
    name: "copy-log-shipper-binary",
    image: env.LOG_SHIPPER_IMAGE,
    imagePullPolicy: "Always",
    args: ["/mnt/log-shipper-volume"],
    volumeMounts: [
      {
        name: "anvilops-log-shipper-binary",
        mountPath: "/mnt/log-shipper-volume",
      },
    ],
  });

  for (const container of clone.spec.containers) {
    if (!container.volumeMounts) {
      container.volumeMounts = [];
    }
    container.volumeMounts.push({
      name: "anvilops-log-shipper-binary",
      mountPath: "/_private_anvilops_log_shipper",
    });

    // Now, every container in the pod has access to the log shipper binary at `/_private_anvilops_log_shipper/log-shipper`

    // Populate the container's CMD and ENTRYPOINT if necessary because we need to modify them
    if (!container.command || !container.args) {
      const imageInfo = parseImageRef(container.image);
      const config = await getImageConfig(imageInfo);
      const { Cmd, Entrypoint } = config.config;
      container.command = Entrypoint;
      container.args = Cmd;
    }

    // Make this container run the log shipper, which will invoke the original program after it starts up
    const program = container.command;
    container.command = ["/_private_anvilops_log_shipper/log-shipper"];
    container.args = [...program, ...container.args];

    if (!container.env) {
      container.env = [];
    }
    container.env.push(
      {
        name: "_PRIVATE_ANVILOPS_LOG_ENDPOINT",
        value: `${env.CLUSTER_INTERNAL_BASE_URL}/api/logs/ingest`,
      },
      {
        name: "_PRIVATE_ANVILOPS_LOG_TOKEN",
        value: logIngestToken,
      },
      {
        name: "_PRIVATE_ANVILOPS_LOG_TYPE",
        value: logType,
      },
      {
        name: "_PRIVATE_ANVILOPS_LOG_DEPLOYMENT_ID",
        value: deploymentId.toString(),
      },
    );
  }

  return clone;
}

/**
 * Parses an image reference in the format [server/[namespace/]]image[:version]
 * (e.g. docker.io/library/nginx or nginx:latest or library/nginx)
 */
export function parseImageRef(reference: string) {
  let repository: string, image: string, tag: string, digest: string;

  // If the image tag ends with `@sha256:<digest>`, remove it from the tag and return it as a separate field
  const digestSpecifier = "@sha256:";
  const digestEndRegexp = new RegExp(digestSpecifier + "[a-z0-9]{64}$", "gi");
  if (reference.match(digestEndRegexp)) {
    const index = reference.lastIndexOf(digestSpecifier);
    digest = reference.substring(index + 1);
    reference = reference.substring(0, index);
  }

  const split = reference.split("/");
  // Take off the first segment and check if it's a domain name
  if (split[0].includes(".") || (split.length > 1 && split[0].includes(":"))) {
    // split[0] is a domain name
    repository = split.shift();
  } else {
    // Use the default domain
    repository = "registry-1.docker.io";
  }

  const pathParts: string[] = [];
  for (let i = 0; i < split.length; i++) {
    const part = split[i];
    if (part.includes(":")) {
      // This part contains the tag
      if (i != split.length - 1) {
        throw new Error("Unexpected / in image tag");
      }
      pathParts.push(part.substring(0, part.indexOf(":")));
      tag = part.substring(part.indexOf(":") + 1);
    } else {
      pathParts.push(part);
    }
  }

  image = pathParts.join("/");
  tag ??= "latest"; // "latest" is the default tag for references that don't have one included

  if (repository === "docker.io") {
    repository = "registry-1.docker.io";
  }

  if (repository === "registry-1.docker.io" && !image.includes("/")) {
    // Docker Hub images with no namespace should be prefixed with "library/"; e.g. nginx -> library/nginx
    image = "library/" + image;
  }

  if (repository.startsWith("localhost:")) {
    // Workaround for Tilt development environment. Tilt injects image names into environment variables as `localhost:xxxxx/anvilops-xxxxx:tilt-xxxx`.
    // However, inside the cluster, we can't fetch that URL to get information about the image. Instead, we should be using a hostname that is accessible within the cluster.
    repository = env.REGISTRY_HOSTNAME;
  }

  if (!repository || !image || !tag) {
    throw new Error("Invalid image reference: one or more parts is missing");
  }

  return { repository, image, tag, digest };
}

// https://docs.docker.com/reference/api/registry/latest/#tag/pull
export async function getImageConfig({
  repository,
  image,
  tag,
  digest: digestInput,
}: {
  repository: string;
  image: string;
  tag: string;
  digest: string;
}): Promise<ImageConfig> {
  // Get the image digest from its tag
  const protocol =
    repository === env.REGISTRY_HOSTNAME ? env.REGISTRY_PROTOCOL : "https";
  const baseURL = protocol + "://" + repository;

  let token: string | undefined; // Set to `undefined` if the registry doesn't require authentication

  const reference = digestInput ?? tag;

  const fetchDigest = async () =>
    await fetch(baseURL + `/v2/${image}/manifests/${reference}`, {
      headers: {
        Accept:
          "application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
        Authorization: token ? `Bearer ${token}` : undefined,
      },
    });

  let digestResponse = await fetchDigest();

  if (digestResponse.status === 401) {
    // We need to provide credentials to obtain a token
    const authHeader = digestResponse.headers.get("www-authenticate");
    const { realm, scope, service } = parseWwwAuthHeader(authHeader);

    const url = new URL(realm);
    url.searchParams.set("scope", scope);
    url.searchParams.set("service", service);
    const tokenResponse = await fetch(url).then((response) => response.json());

    token =
      (tokenResponse as any)?.token ?? (tokenResponse as any)?.access_token;
    if (!token || typeof token !== "string") {
      throw new Error(
        "Couldn't get token from registry: invalid response format: " +
          JSON.stringify(tokenResponse),
      );
    }

    digestResponse = await fetchDigest();
  } else if (digestResponse.status !== 200) {
    throw new Error(
      "Unexpected response while obtaining image digest: " +
        digestResponse.status,
    );
  }

  const digestJson = (await digestResponse.json()) as any;
  if (digestJson.schemaVersion !== 2) {
    throw new Error(
      "Invalid schema version: expected 2, got " + digestJson.schemaVersion,
    );
  }

  let configDigest: string;

  if (
    digestJson.mediaType ===
    "application/vnd.docker.distribution.manifest.v2+json"
  ) {
    // This response is one manifest
    configDigest = digestJson.config.digest;
  } else if (
    digestJson.mediaType ===
      "application/vnd.docker.distribution.manifest.list.v2+json" ||
    digestJson.mediaType === "application/vnd.oci.image.index.v1+json"
  ) {
    // This response is a list of manifests. Pick the one that best matches our system architecture and OS.
    digestJson.manifests.sort((manifest) => {
      let score = 0;
      if (manifest.digest === digestInput) {
        score = Number.MIN_SAFE_INTEGER; // This image must come first since we're specifically looking for it by its digest
      }
      if (manifest.platform.architecture === "amd64") {
        score++;
      }
      if (manifest.platform.os === "linux") {
        score++;
      }

      return score;
    });

    const primaryDigest = digestJson.manifests[0].digest;

    if (reference !== digestInput) {
      // ^ We looked up the image manifest earlier by its tag, not its digest. That means one of the items in the manifest must have a matching digest.
      if (digestInput && primaryDigest !== digestInput) {
        throw new Error("No image found with matching digest: " + digestInput);
      }
    }

    const imageInfoResponse = await fetch(
      baseURL + "/v2/" + image + "/manifests/" + primaryDigest,
      {
        headers: {
          Accept: "application/vnd.docker.distribution.manifest.v2+json",
          Authorization: token ? `Bearer ${token}` : undefined,
        },
      },
    );

    const imageJson = (await imageInfoResponse.json()) as any;
    configDigest = imageJson.config.digest;
  } else {
    throw new Error("Unexpected media type: " + digestJson.mediaType);
  }

  // Download the image configuration
  const imageConfigResponse = await fetch(
    baseURL + "/v2/" + image + "/blobs/" + configDigest,
    { headers: { Authorization: token ? `Bearer ${token}` : undefined } },
  );

  const imageConfig = await imageConfigResponse.json();

  return imageConfig as ImageConfig;
}

// key1="value1", key2="value2", key3="value3", ...
const wwwAuthKeyValuePairRegex = /([a-z]+)="([^,]+)"/g;

/**
 * Parses a WWW-Authenticate header value based on
 * https://datatracker.ietf.org/doc/html/rfc6750#section-3
 */
export function parseWwwAuthHeader(value: string): Record<string, string> {
  const authInfo: Record<string, string> = {};
  for (const match of value.matchAll(wwwAuthKeyValuePairRegex)) {
    authInfo[match[1]] = match[2];
  }
  return authInfo;
}
