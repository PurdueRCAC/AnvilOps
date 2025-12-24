import crypto from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { svcK8s } from "./cluster/kubernetes.ts";
import { env } from "./env.ts";
import { type GitProvider } from "./git/gitProvider.ts";

export async function copyRepoManually(
  gitProvider: GitProvider,
  cloneURL: string,
  pushURL: string,
) {
  const botUser = await gitProvider.getBotCommitterDetails();

  const job = await svcK8s["BatchV1Api"].createNamespacedJob({
    namespace: env.CURRENT_NAMESPACE,
    body: {
      metadata: {
        name: `import-repo-${crypto.randomBytes(16).toString("hex")}`,
      },
      spec: {
        ttlSecondsAfterFinished: 30, // Delete job 30 seconds after it completes
        backoffLimit: 1, // Retry up to 1 time if the job exits with a non-zero status code
        activeDeadlineSeconds: 2 * 60, // Kill after 2 minutes
        template: {
          spec: {
            containers: [
              {
                name: "importer",
                image: "alpine/git:v2.49.0",
                env: [
                  { name: "CLONE_URL", value: cloneURL },
                  { name: "PUSH_URL", value: pushURL },
                  { name: "USER_EMAIL", value: botUser.email },
                  { name: "USER_NAME", value: botUser.name },
                ],
                imagePullPolicy: "Always",
                command: ["/bin/sh", "-c"],
                workingDir: "/work",
                args: [
                  `
git clone --depth=1 --shallow-submodules "$CLONE_URL" .
rm -rf .git

git init
git branch -M main

git config user.email "$USER_EMAIL"
git config user.name "$USER_NAME"

git add .
git commit -m "Initial commit"

git remote add origin "$PUSH_URL"
git push -u origin main`,
                ],
                volumeMounts: [
                  {
                    mountPath: "/work",
                    name: "work-dir",
                  },
                ],
                resources: {
                  requests: {
                    cpu: "500m",
                    memory: "512Mi",
                  },
                  limits: {
                    cpu: "500m",
                    memory: "512Mi",
                  },
                },
                securityContext: {
                  // TODO: Use a custom image that specifies a user. Then, add a securityContext that runs as that non-root user and enables readOnlyRootFileSystem.
                  capabilities: {
                    drop: ["ALL"],
                  },
                  allowPrivilegeEscalation: false,
                },
              },
            ],
            volumes: [
              {
                name: "work-dir",
                emptyDir: {
                  sizeLimit: "1Gi",
                },
              },
            ],
            restartPolicy: "Never",
          },
        },
      },
    },
  });

  await awaitJobCompletion(job.metadata.name);
}

async function awaitJobCompletion(jobName: string) {
  for (let i = 0; i < 120; i++) {
    const result = await svcK8s["BatchV1Api"].readNamespacedJobStatus({
      namespace: env.CURRENT_NAMESPACE,
      name: jobName,
    });
    if (result.status.succeeded > 0) {
      return true;
    }
    if (result.status.failed > 0) {
      throw new Error("Job failed");
    }
    await setTimeout(500);
  }
  return false;
}
