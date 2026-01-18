import { createRequire } from "node:module";
import { resolve } from "node:path";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const __dirname = new URL(".", import.meta.url).pathname;

const lib = require(resolve(__dirname, "./regclient_napi.node"));

const getImageInfoPromise = promisify(lib.getImageInfo);

export interface ImageConfig {
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
}

export async function getImageConfig(
  imageTag: string,
  overrideTLSHostname?: string,
  overrideTLSState?: "enabled" | "disabled" | "insecure",
): Promise<ImageConfig> {
  const result = await getImageInfoPromise(
    imageTag,
    overrideTLSHostname ?? "",
    overrideTLSState ?? "",
  );
  const obj = JSON.parse(result);

  if (obj.success === true) {
    return obj.result as ImageConfig;
  } else {
    throw new Error(obj.error);
  }
}
