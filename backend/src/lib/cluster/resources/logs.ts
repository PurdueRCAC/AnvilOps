import type { V1PodTemplateSpec } from "@kubernetes/client-node";
import { spawn } from "node:child_process";
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
      const config = await getImageConfig(container.image);
      const { Cmd, Entrypoint } = config.config;

      // Either ENTRYPOINT or CMD must be specified in an image
      container.command = Entrypoint ?? [];
      container.args = Cmd ?? [];
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

export async function getImageConfig(reference: string): Promise<ImageConfig> {
  if (env.IN_TILT && reference.startsWith("localhost:")) {
    // When we're in a Tilt development environment, the builder image environment variables contain
    // references to a registry at `localhost`. This works from the host machine, but it doesn't work from inside
    // the container. Instead, we need to replace it with the cluster-internal hostname.
    reference = reference.replace(
      /^localhost:\d+\//,
      env.REGISTRY_HOSTNAME + "/",
    );
  }

  const child = spawn(
    "regctl",
    [
      "image",
      "inspect",
      `--host=reg=${env.REGISTRY_HOSTNAME},tls=${env.REGISTRY_PROTOCOL !== "http" ? "enabled" : "disabled"}`,
      reference,
    ],
    {
      timeout: 10_000 /* 10 seconds */,
    },
  );

  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk.toString()));
  child.stderr.on("data", (chunk) => console.error(chunk.toString()));

  return await new Promise((resolve, reject) => {
    child.on("error", (error) => reject(error));
    child.on("close", () => {
      try {
        resolve(JSON.parse(output) as ImageConfig);
      } catch (e) {
        reject(e);
      }
    });
  });
}
