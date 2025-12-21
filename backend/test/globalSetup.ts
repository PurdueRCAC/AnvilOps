import { spawn } from "node:child_process";
import type { TestProject } from "vitest/node";
import { server } from "../src/index.ts"; // Start up the AnvilOps server

export async function setup(project: TestProject) {
  project.onTestsRerun(async () => {
    await resetDatabase();
  });
  await resetDatabase();
}

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const subprocess = spawn("npx", ["prisma", "migrate", "reset", "--force"], {
      stdio: "inherit",
    });
    subprocess.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject();
      }
    });
  });
}

export function teardown(project: TestProject) {
  server.close();
}
