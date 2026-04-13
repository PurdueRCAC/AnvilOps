import {
  ApiException,
  ApiextensionsV1Api,
  AppsV1Api,
  AuthorizationV1Api,
  BatchV1Api,
  CoreV1Api,
  KubeConfig,
  KubernetesObjectApi,
  Log,
  PatchStrategy,
  Watch,
  type KubernetesObject,
  type V1Namespace,
} from "@kubernetes/client-node";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { setTimeout } from "node:timers/promises";
import type { App } from "../../../db/models.ts";
import type { UserRepo } from "../../../db/repo/user.ts";
import { env } from "../../../lib/env.ts";
import { logger } from "../../../logger.ts";
import { shouldImpersonate } from "./rancher.ts";
import type { K8sObject } from "./resources.ts";

const tracer = trace.getTracer("kubernetes-api");

const kc = new KubeConfig();
kc.loadFromDefault();

const APIClientFactory = {
  CoreV1Api: (kc: KubeConfig) => kc.makeApiClient(CoreV1Api),
  AppsV1Api: (kc: KubeConfig) => kc.makeApiClient(AppsV1Api),
  BatchV1Api: (kc: KubeConfig) => kc.makeApiClient(BatchV1Api),
  AuthorizationV1Api: (kc: KubeConfig) => kc.makeApiClient(AuthorizationV1Api),
  KubernetesObjectApi: (kc: KubeConfig) =>
    KubernetesObjectApi.makeApiClient(kc),
  Watch: (kc: KubeConfig) => new Watch(kc),
  Log: (kc: KubeConfig) => new Log(kc),
  ExtensionsV1Api: (kc: KubeConfig) => kc.makeApiClient(ApiextensionsV1Api),
};
Object.freeze(APIClientFactory);

type APIClassName = keyof typeof APIClientFactory;
type APIClientTypes = {
  [K in APIClassName]: ReturnType<(typeof APIClientFactory)[K]>;
};

const baseKc = new KubeConfig();
baseKc.loadFromDefault();

const svcK8s = {} as APIClientTypes;
for (const apiClassName of Object.keys(APIClientFactory)) {
  Object.assign(svcK8s, {
    [apiClassName as APIClassName]:
      APIClientFactory[apiClassName as APIClassName](baseKc),
  });
}
Object.freeze(svcK8s);

export class KubernetesClientService {
  private userRepo: UserRepo;

  constructor(userRepo: UserRepo) {
    this.userRepo = userRepo;
  }

  getClientForClusterUsername<T extends APIClassName>(
    clusterUsername: string,
    apiClassName: T,
    shouldImpersonate: boolean,
  ): APIClientTypes[T] {
    if (!Object.prototype.hasOwnProperty.call(APIClientFactory, apiClassName)) {
      throw new Error("Invalid API class " + apiClassName);
    }
    if (!shouldImpersonate || !clusterUsername) {
      return svcK8s[apiClassName];
    } else {
      const kc = new KubeConfig();
      kc.loadFromOptions({
        ...baseKc,
        users: [{ ...baseKc.users[0], impersonateUser: clusterUsername }],
      });
      return APIClientFactory[apiClassName](kc) as APIClientTypes[T];
    }
  }

  async getClientsForRequest<Names extends APIClassName[]>(
    reqUserId: number,
    projectId: string | undefined,
    apiClassNames: Names,
  ): Promise<Pick<APIClientTypes, Names[number]>> {
    return await tracer.startActiveSpan(
      "getClientsForRequest",
      async (span) => {
        try {
          apiClassNames.forEach((name) => {
            if (!Object.prototype.hasOwnProperty.call(APIClientFactory, name)) {
              throw new Error("Invalid API class " + name);
            }
          });

          const impersonate = shouldImpersonate(projectId);
          const clusterUsername = !impersonate
            ? null
            : await this.userRepo
                .getById(reqUserId)
                .then((user) => user.clusterUsername);

          return apiClassNames.reduce((result, apiClassName) => {
            return {
              ...result,
              [apiClassName]: this.getClientForClusterUsername(
                clusterUsername,
                apiClassName,
                impersonate,
              ),
            };
          }, {}) as Pick<APIClientTypes, Names[number]>;
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }

  async resourceExists(api: KubernetesObjectApi, data: K8sObject) {
    try {
      await api.read(data);
      return true;
    } catch (err) {
      if (err instanceof ApiException) {
        // Assumes a namespace does not exist if request results in 403 Forbidden - potential false negative
        if (
          (data.kind === "Namespace" && err.code === 403) ||
          err.code === 404
        ) {
          return false;
        }
      }
      throw err;
    }
  }

  private static REQUIRED_LABELS = env["RANCHER_API_BASE"]
    ? ["field.cattle.io/projectId", "lifecycle.cattle.io/create.namespace-auth"]
    : [];

  async ensureNamespace(
    api: KubernetesObjectApi,
    namespace: V1Namespace & K8sObject,
  ) {
    await api.create(namespace);
    for (let i = 0; i < 20; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res: V1Namespace = await api.read(namespace);
        if (
          res.status.phase === "Active" &&
          KubernetesClientService.REQUIRED_LABELS.every((label) =>
            Object.prototype.hasOwnProperty.call(
              res.metadata.annotations,
              label,
            ),
          )
        ) {
          return;
        }
      } catch (err) {
        if (
          !(err instanceof ApiException) ||
          (err.code !== 404 && err.code !== 403)
        ) {
          logger.error(
            err,
            "Failed to look up namespace while waiting for it to be created",
          );
        }
      }

      // eslint-disable-next-line no-await-in-loop
      await setTimeout(200);
    }

    throw new Error("Timed out waiting for namespace to create");
  }

  async deleteNamespace(api: KubernetesObjectApi, name: string) {
    try {
      await api.delete({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: { name },
      });
      logger.info({ name }, "Deleted namespace");
    } catch (err) {
      if (
        err instanceof ApiException &&
        (err.code === 404 || err.code === 403)
      ) {
        return;
      }
      throw err;
    }
  }

  async createOrUpdateApp(
    app: App,
    namespace: V1Namespace & K8sObject,
    configs: K8sObject[],
    postCreate?: (api: KubernetesObjectApi) => Promise<unknown>,
  ) {
    await trace
      .getTracer("kubernetes-api")
      .startActiveSpan("createOrUpdateApp", async (span) => {
        try {
          const api = this.getClientForClusterUsername(
            app.clusterUsername,
            "KubernetesObjectApi",
            shouldImpersonate(app.projectId),
          );

          if (await this.resourceExists(api, namespace)) {
            await api.patch(namespace);
          } else {
            await this.ensureNamespace(api, namespace);
          }

          const promises = configs.map(async (config) => {
            const exists = await this.resourceExists(api, config);
            if (exists) {
              return api.patch(
                config,
                undefined,
                undefined,
                undefined,
                undefined,
                // Use the non-strategic merge patch here because app updates involve replacing entire lists instead of partially updating them.
                // For example, when setting environment variables, the strategic merge strategy wouldn't remove environment variables
                // that we didn't specify in the updated configuration unless we explicitly tell it to via `$retainKeys`.
                // More info on patch types: https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/
                PatchStrategy.MergePatch,
              );
            } else {
              return api.create(config);
            }
          });

          await Promise.all(promises);

          await postCreate?.(api);
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        } finally {
          span.end();
        }
      });
  }

  async cancelBuildJobsForApp(appId: number) {
    await svcK8s["BatchV1Api"].deleteCollectionNamespacedJob({
      namespace: env.CURRENT_NAMESPACE,
      labelSelector: `anvilops.rcac.purdue.edu/app-id=${appId.toString()}`,
      propagationPolicy: "Background", // Delete dependent resources (pods and secrets) in the background. Without this option, they would not be deleted at all.
    });
  }

  async countActiveBuildJobs() {
    const jobs = await svcK8s["BatchV1Api"].listNamespacedJob({
      // TODO filter for a certain label that indicates that this Job is a build job
      namespace: env.CURRENT_NAMESPACE,
    });

    return jobs.items.filter((job) => job.status?.active).length;
  }

  createNamespacedSecret = svcK8s["CoreV1Api"].createNamespacedSecret.bind(
    svcK8s["CoreV1Api"],
  );
  patchNamespacedSecret = svcK8s["CoreV1Api"].patchNamespacedSecret.bind(
    svcK8s["CoreV1Api"],
  );
  deleteNamespacedSecret = svcK8s["CoreV1Api"].deleteNamespacedSecret.bind(
    svcK8s["CoreV1Api"],
  );
  createNamespacedJob = svcK8s["BatchV1Api"].createNamespacedJob.bind(
    svcK8s["BatchV1Api"],
  );
  readNamespacedPersistentVolumeClaim = svcK8s[
    "CoreV1Api"
  ].readNamespacedPersistentVolumeClaim.bind(svcK8s["CoreV1Api"]);
  listNamespacedPod = svcK8s["CoreV1Api"].listNamespacedPod.bind(
    svcK8s["CoreV1Api"],
  );
  readNamespace = svcK8s["CoreV1Api"].readNamespace.bind(svcK8s["CoreV1Api"]);

  async dryRunCreate(object: KubernetesObject) {
    return await svcK8s["KubernetesObjectApi"].create(
      object,
      undefined,
      /* dryRun = */ "All",
    );
  }

  async awaitJobCompletion(
    namespace: string,
    jobName: string,
    maxRetries: number = 120,
    frequencyMs: number = 500,
  ) {
    for (let i = 0; i < maxRetries; i++) {
      // eslint-disable-next-line no-await-in-loop
      const result = await svcK8s["BatchV1Api"].readNamespacedJobStatus({
        namespace: namespace,
        name: jobName,
      });
      if (result.status.succeeded > 0) {
        return true;
      }
      if (result.status.failed > 0) {
        throw new Error("Job failed");
      }
      // eslint-disable-next-line no-await-in-loop
      await setTimeout(frequencyMs);
    }
    return false;
  }
}
