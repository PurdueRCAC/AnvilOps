import { KubeConfig } from "@kubernetes/client-node";
import { getOrCreate } from "../cache.ts";
import { env } from "../env.ts";
import { getClientForClusterUsername } from "./kubernetes.ts";

const kc = new KubeConfig();
kc.loadFromDefault();

const token = env["RANCHER_TOKEN"];
const headers = {
  Authorization: `Basic ${token}`,
};
const API_BASE_URL = env["RANCHER_API_BASE"];

const SANDBOX_ID = env["SANDBOX_ID"];

export const isRancherManaged = () => !!API_BASE_URL && !!token;

const fetchRancherResource = async (endpoint: string) => {
  return fetch(`${API_BASE_URL}/${endpoint}`, { headers })
    .then((res) => res.text())
    .then((res) => JSON.parse(res))
    .then((res) => (res.type === "error" ? new Error(res.message) : res));
};

const getProjectById = async (id: string) => {
  const project = await fetchRancherResource(`projects/${id}`);

  return {
    id: project.id,
    name: project.name,
    description: project.description,
  };
};

const fetchUserProjects = async (rancherId: string) => {
  const bindings = await fetchRancherResource(
    `projectRoleTemplateBindings?userId=${rancherId}`,
  ).then((res) => res.data);
  const projectIds = bindings.map((binding: any) => binding.projectId);
  projectIds.push(SANDBOX_ID);
  const uniqueProjectIds = [...new Set(projectIds)] as string[];

  const authClient = getClientForClusterUsername(
    rancherId,
    "AuthorizationV1Api",
    true,
  );
  const canDeployIn = await Promise.all(
    uniqueProjectIds.map((projectId) => {
      if (projectId === SANDBOX_ID) return true;

      const simpleProjectId = projectId.split(":")[1]; // Split the project id off from the cluster id

      return authClient
        .createSelfSubjectAccessReview({
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
        })
        .then(
          (review) => review.status.allowed,
          (err) => {
            console.error(err);
            return false;
          },
        );
    }),
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
};

const getProjectAccessReview = async (userId: string, projectId: string) => {
  if (!projectId) {
    return false;
  }
  if (projectId === SANDBOX_ID) {
    return true;
  }
  const simpleProjectId = projectId.split(":")[1];
  const authClient = getClientForClusterUsername(
    userId,
    "AuthorizationV1Api",
    true,
  );
  return authClient
    .createSelfSubjectAccessReview({
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
    })
    .then(
      (review) => review.status.allowed,
      (err) => {
        console.error(err);
        return false;
      },
    );
};

export const getRancherUserID = async (eppn: string) => {
  const users = await fetchRancherResource("users");
  const principalId = `${env.LOGIN_TYPE}_user://${eppn}`;
  const user = users?.data?.find((user: any) =>
    user.principalIds.some((id: string) => id === principalId),
  );

  return user?.id;
};

export const getProjectsForUser = async (
  rancherId: string,
): Promise<
  {
    id: string;
    name: string;
    description: string;
  }[]
> => {
  return JSON.parse(
    await getOrCreate(`rancher-projects-${rancherId}`, 15, async () =>
      JSON.stringify(await fetchUserProjects(rancherId)),
    ),
  );
};

export const canManageProject = async (userId: string, projectId: string) => {
  return (
    (await getOrCreate(`rancher-canmanage-${userId}-${projectId}`, 15, () =>
      getProjectAccessReview(userId, projectId).then((res) => res.toString()),
    )) === "true"
  );
};

export const shouldImpersonate = (projectId: string) =>
  projectId !== SANDBOX_ID;
