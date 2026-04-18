import { env } from "../../../lib/env.ts";
import { logger } from "../../../logger.ts";
import { type KVCacheService } from "../cache.ts";
import type { KubernetesClientService } from "./kubernetes.ts";

const token = env["RANCHER_TOKEN"];
const headers = {
  Authorization: `Basic ${token}`,
};
const BASE_URL = env["RANCHER_BASE_URL"];

const SANDBOX_ID = env["SANDBOX_ID"];

const fetchRancherResource = async <T extends { type: string }>(
  endpoint: string,
) => {
  const res = await fetch(`${BASE_URL}/v3/${endpoint}`, { headers });
  const json = (await res.json()) as T;
  if (json.type === "error") {
    throw new Error(JSON.stringify(json));
  }
  return json;
};

const getProjectById = async (id: string) => {
  const project = await fetchRancherResource<RancherProject>(`projects/${id}`);
  return {
    id: project.id,
    name: project.name,
    description: project.description,
  };
};

export class RancherService {
  private kubernetesService: KubernetesClientService;
  private cacheService: KVCacheService;

  constructor(
    kubernetesService: KubernetesClientService,
    cacheService: KVCacheService,
  ) {
    this.kubernetesService = kubernetesService;
    this.cacheService = cacheService;
  }

  isRancherManaged() {
    return !!BASE_URL && !!token;
  }

  async getRancherUserID(eppn: string) {
    const users = await fetchRancherResource<RancherUsersListResponse>("users");
    const principalId = `${env.LOGIN_TYPE}_user://${eppn}`;
    const user = users?.data?.find((user) =>
      user.principalIds.some((id: string) => id === principalId),
    );

    return user?.id;
  }

  async getProjectsForUser(rancherId: string): Promise<
    {
      id: string;
      name: string;
      description: string;
    }[]
  > {
    return JSON.parse(
      await this.cacheService.getOrCreate(
        `rancher-projects-${rancherId}`,
        15,
        async () => JSON.stringify(await this.fetchUserProjects(rancherId)),
      ),
    ) as Awaited<ReturnType<typeof this.fetchUserProjects>>;
  }

  async canManageProject(userId: string, projectId: string) {
    return (
      (await this.cacheService.getOrCreate(
        `rancher-canmanage-${userId}-${projectId}`,
        15,
        () =>
          this.getProjectAccessReview(userId, projectId).then((res) =>
            res.toString(),
          ),
      )) === "true"
    );
  }

  private async getProjectAccessReview(userId: string, projectId: string) {
    if (!projectId) {
      return false;
    }
    if (projectId === SANDBOX_ID) {
      return true;
    }
    const simpleProjectId = projectId.split(":")[1];
    const authClient = this.kubernetesService.getClientForClusterUsername(
      userId,
      "AuthorizationV1Api",
      true,
    );
    try {
      const review = await authClient.createSelfSubjectAccessReview({
        body: {
          spec: {
            resourceAttributes: {
              group: "management.cattle.io",
              resource: "projects",
              verb: "manage-namespaces",
              name: simpleProjectId,
            },
          },
        },
      });
      return review.status.allowed;
    } catch (err) {
      logger.error(err, "Failed to create SelfSubjectAccessReview");
      return false;
    }
  }

  async fetchUserProjects(rancherId: string) {
    const bindings =
      await fetchRancherResource<RancherProjectRoleTemplateBindingsResponse>(
        `projectRoleTemplateBindings?userId=${rancherId}`,
      ).then((res) => res.data);

    const projectIds = bindings
      ? bindings.map((binding) => binding.projectId)
      : [];
    projectIds.push(SANDBOX_ID);

    const uniqueProjectIds = [...new Set(projectIds)];

    const canDeployIn = await Promise.all(
      uniqueProjectIds.map((projectId) =>
        this.getProjectAccessReview(rancherId, projectId),
      ),
    );

    const allowedProjectIds = uniqueProjectIds.filter(
      (_, idx) => canDeployIn[idx],
    );

    return Promise.all(
      allowedProjectIds.map(async (projectId) => {
        const project = await getProjectById(projectId);
        return {
          id: project.id,
          name: project.name,
          description: project.description,
        };
      }),
    );
  }
}

// TODO move inside RancherService and remove cyclic dependency with KubernetesService
export function shouldImpersonate(projectId: string) {
  return projectId !== SANDBOX_ID;
}

type RancherProject = {
  actions: {
    /** URL */
    exportYaml: string;
  };
  annotations: Record<string, string>;
  baseType: "project";
  clusterId: string;
  conditions: {
    /** ISO-formatted date string */
    lastUpdateTime: string;
    status: "True" | "False";
    type: string;
  }[];
  /** ISO-formatted date string */
  created: string;
  createdTS: number;
  creatorId: string;
  description: string;
  id: string;
  labels: Record<string, string>;
  links: Record<string, string>;
  name: string;
  namespaceId: null;
  state: string;
  transitioning: string;
  transitioningMessage: string;
  type: "project";
  uuid: string;
};

type RancherProjectRoleTemplateBindingsResponse = {
  type: "collection";
  links: {
    /** URL */
    self: string;
  };
  createTypes: {
    /** URL */
    projectRoleTemplateBinding: string;
  };
  actions: object;
  pagination: { limit: number; total: number };
  sort: {
    order: "asc" | "desc";
    /** URL */
    reverse: string;
    links: {
      /** URL */
      serviceAccount: string;
      /** URL */
      uuid: string;
    };
  };
  filters: Record<string, object>;
  resourceType: "projectRoleTemplateBinding";
  data: {
    annotations: Record<string, string>;
    baseType: "projectRoleTemplateBinding";
    /** ISO date string */
    created: string;
    createdTS: number;
    creatorId: string | null;
    groupId: string | null;
    groupPrincipalId: string | null;
    id: string;
    labels: Record<string, string>;
    /** Map of URLs */
    links: Record<"remove" | "self" | "update", string>;
    name: string;
    namespaceId: string | null;
    projectId: string;
    roleTemplateId: string;
    type: "projectRoleTemplateBinding";
    userId: string;
    userPrincipalId: string;
    uuid: string;
  }[];
};

type RancherUsersListResponse = {
  type: "collection";
  links: {
    /** URL */ self: string;
  };
  createTypes: {
    /** URL */ user: string;
  };
  actions: {
    /** URL */ changepassword: string;
    /** URL */ refreshauthprovideraccess: string;
  };
  pagination: { limit: 1000; total: 168 };
  sort: {
    order: "asc";
    /** URL */
    reverse: string;
    /** Map of URLs */
    links: Record<
      | "description"
      | "name"
      | "password"
      | "state"
      | "transitioning"
      | "transitioningMessage"
      | "username"
      | "uuid",
      string
    >;
  };
  filters: Record<
    | "created"
    | "creatorId"
    | "description"
    | "enabled"
    | "id"
    | "me"
    | "mustChangePassword"
    | "name"
    | "password"
    | "removed"
    | "state"
    | "transitioning"
    | "transitioningMessage"
    | "username"
    | "uuid",
    object
  >;
  resourceType: "user";
  data: {
    /** Map of URLs */
    actions: Record<"refreshauthprovideraccess" | "setpassword", string>;
    annotations: Record<string, string>;
    baseType: "user";
    conditions: {
      /** ISO date */ lastUpdateTime: string;
      status: "True" | "False";
      type: string;
    }[];
    /** ISO date */
    created: string;
    createdTS: number;
    creatorId: string | null;
    description: string;
    enabled: boolean;
    id: string;
    labels: Record<string, string>;
    /** Map of URLs */
    links: Record<
      | "clusterRoleTemplateBindings"
      | "globalRoleBindings"
      | "projectRoleTemplateBindings"
      | "remove"
      | "self"
      | "tokens"
      | "update",
      string
    >;
    me: false;
    mustChangePassword: false;
    name: string;
    principalIds: string[];
    state: string;
    transitioning: string;
    transitioningMessage: string;
    type: "user";
    uuid: string;
  }[];
};
