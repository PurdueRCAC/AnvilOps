import { spawn } from "child_process";
import { parse as yamlParse } from "yaml";
import { HelmUrlType } from "../generated/prisma/enums.ts";

type Dependency = {
  name: string;
  version: string;
  repository?: string;
  condition?: string;
  tags?: string[];
  "import-values"?: string;
  alias?: string;
};

type Chart = {
  apiVersion: string;
  name: string;
  version: string;
  kubeVersion?: string;
  description?: string;
  type?: string;
  keywords?: string[];
  home?: string;
  sources?: string[];
  dependencies?: Dependency[];
  maintainers?: { name: string; email: string; url: string }[];
  icon?: string;
  appVersion?: string;
  deprecated?: boolean;
  annotations?: Record<string, string>;
};

const runHelm = (args: string[]) => {
  return new Promise((resolve, reject) => {
    const p = spawn("helm", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "",
      err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err || `helm exit ${code}`)),
    );
  });
};

export const getChart = async (
  url: string,
  version?: string,
): Promise<Chart> => {
  const args = ["show", "chart"];
  if (version) {
    args.push("version", version);
  }
  args.push(url);

  const result = (await runHelm(args)) as string;
  console.log("result", result);
  const chart = (await yamlParse(result)) as Chart;
  return chart;
};

export const upgrade = ({
  urlType,
  chartURL,
  version,
  namespace,
  values,
  release,
}: {
  urlType: HelmUrlType;
  chartURL: string;
  version: string;
  namespace: string;
  values: Record<string, unknown>;
  release: string;
}) => {
  const args = [
    "upgrade",
    "--install",
    "--namespace",
    namespace,
    "--create-namespace",
  ];

  for (const [key, value] of Object.entries(values)) {
    args.push("--set-json", `${key}=${JSON.stringify(value)}`);
  }
  switch (urlType) {
    // example: helm install mynginx https://example.com/charts/nginx-1.2.3.tgz
    case "absolute": {
      args.push(release, chartURL);
      break;
    }

    // example: helm install mynginx --version 1.2.3 oci://example.com/charts/nginx
    case "oci": {
      args.push(release, "--version", version, chartURL);
      break;
    }
  }

  return runHelm(args);
};
