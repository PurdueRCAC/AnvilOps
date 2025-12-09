import { spawn } from "child_process";

export const runHelm = ({
  chartURL,
  namespace,
  values,
  release,
}: {
  chartURL: string;
  namespace: string;
  values: { [key: string]: string };
  release: string;
}) => {
  const kvPairs = Object.keys(values).map((key, value) => `${key}=${value}`);
  const args = [
    "upgrade",
    "--install",
    release,
    chartURL,
    "--namespace",
    namespace,
    "--create-namespace",
    "--set",
    kvPairs.join(","),
  ];

  return new Promise((resolve, reject) => {
    const p = spawn("helm", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "",
      err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) =>
      code === 0
        ? resolve({ out })
        : reject(new Error(err || `helm exit ${code}`)),
    );
  });
};
