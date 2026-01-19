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
  type V1Namespace,
} from "@kubernetes/client-node";
import { db } from "../../db/index.ts";
import { env } from "../env.ts";
import { shouldImpersonate } from "./rancher.ts";
import type { K8sObject } from "./resources.ts";

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

export const svcK8s = {} as APIClientTypes;
for (let apiClassName in APIClientFactory) {
  svcK8s[apiClassName] = APIClientFactory[apiClassName](baseKc);
}
Object.freeze(svcK8s);

export function getClientForClusterUsername<T extends APIClassName>(
  clusterUsername: string,
  apiClassName: T,
  shouldImpersonate: boolean,
): APIClientTypes[T] {
  if (!APIClientFactory.hasOwnProperty(apiClassName)) {
    throw new Error("Invalid API class " + apiClassName);
  }
  if (!shouldImpersonate || !clusterUsername) {
    return svcK8s[apiClassName] as APIClientTypes[T];
  } else {
    const kc = new KubeConfig();
    kc.loadFromOptions({
      ...baseKc,
      users: [{ ...baseKc.users[0], impersonateUser: clusterUsername }],
    });
    return APIClientFactory[apiClassName](kc) as APIClientTypes[T];
  }
}

export async function getClientsForRequest<Names extends APIClassName[]>(
  reqUserId: number,
  projectId: string | undefined,
  apiClassNames: Names,
): Promise<Pick<APIClientTypes, Names[number]>> {
  apiClassNames.forEach((name) => {
    if (!APIClientFactory.hasOwnProperty(name)) {
      throw new Error("Invalid API class " + name);
    }
  });

  const impersonate = shouldImpersonate(projectId);
  const clusterUsername = !impersonate
    ? null
    : await db.user.getById(reqUserId).then((user) => user.clusterUsername);

  return apiClassNames.reduce((result, apiClassName) => {
    return {
      ...result,
      [apiClassName]: getClientForClusterUsername(
        clusterUsername,
        apiClassName,
        impersonate,
      ),
    };
  }, {}) as Pick<APIClientTypes, Names[number]>;
}

export const resourceExists = async (
  api: KubernetesObjectApi,
  data: K8sObject,
) => {
  try {
    await api.read(data);
    return true;
  } catch (err) {
    if (err instanceof ApiException) {
      // Assumes a namespace does not exist if request results in 403 Forbidden - potential false negative
      if ((data.kind === "Namespace" && err.code === 403) || err.code === 404) {
        return false;
      }
    }
    throw err;
  }
};

const REQUIRED_LABELS = env["RANCHER_API_BASE"]
  ? ["field.cattle.io/projectId", "lifecycle.cattle.io/create.namespace-auth"]
  : [];
export const ensureNamespace = async (
  api: KubernetesObjectApi,
  namespace: V1Namespace & K8sObject,
) => {
  await api.create(namespace);
  for (let i = 0; i < 20; i++) {
    try {
      const res: V1Namespace = await api.read(namespace);
      if (
        res.status.phase === "Active" &&
        REQUIRED_LABELS.every((label) =>
          res.metadata.annotations.hasOwnProperty(label),
        )
      ) {
        return;
      }
    } catch (err) {}

    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error("Timed out waiting for namespace to create");
};

export const deleteNamespace = async (
  api: KubernetesObjectApi,
  name: string,
) => {
  try {
    await api.delete({
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name },
    });
  } catch (err) {
    if (err instanceof ApiException && (err.code === 404 || err.code === 403)) {
      return;
    }
    throw err;
  }
};

export const createOrUpdateApp = async (
  api: KubernetesObjectApi,
  name: string,
  namespace: V1Namespace & K8sObject,
  configs: K8sObject[],
  postCreate?: (api: KubernetesObjectApi) => void,
) => {
  if (await resourceExists(api, namespace)) {
    await api.patch(namespace);
  } else {
    await ensureNamespace(api, namespace);
  }

  for (let config of configs) {
    if (await resourceExists(api, config)) {
      await api.patch(
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
      await api.create(config);
    }
  }

  postCreate?.(api);
};
