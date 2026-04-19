import { logger } from "../../../logger.ts";
import { type KVCacheService } from "../cache.ts";
import type { KubernetesClientService } from "./kubernetes.ts";
import type { RancherService } from "./rancher.ts";

export class RancherAccessService {
  private kubernetesService: KubernetesClientService;
  private rancherService: RancherService;
  private cacheService: KVCacheService;
  private sandboxProjectID: string;

  constructor(
    kubernetesService: KubernetesClientService,
    rancherService: RancherService,
    cacheService: KVCacheService,
    sandboxProjectID: string,
  ) {
    this.kubernetesService = kubernetesService;
    this.rancherService = rancherService;
    this.cacheService = cacheService;
    this.sandboxProjectID = sandboxProjectID;
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
    if (projectId === this.sandboxProjectID) {
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

  private async fetchUserProjects(rancherId: string) {
    const bindings = await this.rancherService
      .fetchRancherResource<RancherProjectRoleTemplateBindingsResponse>(
        `projectRoleTemplateBindings?userId=${rancherId}`,
      )
      .then((res) => res.data);

    const projectIds = bindings
      ? bindings.map((binding) => binding.projectId)
      : [];
    projectIds.push(this.sandboxProjectID);

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
        const project = await this.rancherService.getProjectById(projectId);
        return {
          id: project.id,
          name: project.name,
          description: project.description,
        };
      }),
    );
  }
}

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
