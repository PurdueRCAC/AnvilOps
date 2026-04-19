import { SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("rancher-api");

export class RancherService {
  private token: string;
  private baseURL: string;
  private loginType: string;
  private sandboxProjectID: string;

  constructor(
    token: string,
    baseURL: string,
    loginType: string,
    sandboxProjectID: string,
  ) {
    this.token = token;
    this.baseURL = baseURL;
    this.loginType = loginType;
    this.sandboxProjectID = sandboxProjectID;
  }

  async fetchRancherResource<T extends { type: string }>(endpoint: string) {
    return await tracer.startActiveSpan(
      "fetchRancherResource",
      async (span) => {
        try {
          const res = await fetch(`${this.baseURL}/${endpoint}`, {
            headers: { Authorization: `Basic ${this.token}` },
            signal: AbortSignal.timeout(5000),
          });

          if (!res.ok) {
            throw new Error(
              `Failed to fetch Rancher resource /${endpoint}: ${res.status} ${res.statusText}`,
            );
          }
          const text = await res.text();
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch (err) {
            throw new Error(
              `Failed to parse JSON from ${this.baseURL}/${endpoint}: ${text.slice(0, 500)}...`,
            );
          }

          const content = json as T;
          if (content.type === "error") {
            throw new Error(JSON.stringify(content).slice(0, 500) + "...");
          }

          return content;
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

  async getProjectById(id: string) {
    const project = await this.fetchRancherResource<RancherProject>(
      `projects/${id}`,
    );
    return {
      id: project.id,
      name: project.name,
      description: project.description,
    };
  }

  isRancherManaged() {
    return !!this.baseURL && !!this.token;
  }

  async getRancherUserID(eppn: string) {
    const users =
      await this.fetchRancherResource<RancherUsersListResponse>("users");
    const principalId = `${this.loginType}_user://${eppn}`;
    const user = users?.data?.find((user) =>
      user.principalIds.some((id: string) => id === principalId),
    );

    return user?.id;
  }

  shouldImpersonate(projectId: string) {
    return projectId !== this.sandboxProjectID;
  }
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
