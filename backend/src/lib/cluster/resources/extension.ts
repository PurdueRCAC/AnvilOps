import { spawn } from "child_process";
import fs from "fs";

const extensions = new Set(fs.readdirSync("/templates/extensions"));

const runHelm = ({ chartPath, namespace, kv, release }) => {
  const args = [
    "upgrade",
    "--install",
    release,
    chartPath,
    "--namespace",
    namespace,
    "--set",
    kv.join(","),
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
