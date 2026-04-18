import type { ImageConfig } from "regclient-napi";
import * as regclient from "regclient-napi";
import { env } from "../../lib/env.ts";
import { logger } from "../../logger.ts";

type HarborRepository = {
  artifact_count: number;
  creation_time: string;
  id: number;
  name: string;
  project_id: number;
  pull_count: number;
  update_time: string;
};

export class RegistryService {
  async deleteRepo(name: string) {
    logger.info({ name }, "Deleting image repository");
    const headers = {
      authorization: `Basic ${Buffer.from(env.DELETE_REPO_USERNAME + ":" + env.DELETE_REPO_PASSWORD).toString("base64")}`,
    };

    await fetch(
      `${env.REGISTRY_PROTOCOL}://${env.REGISTRY_HOSTNAME}/api/v2.0/projects/${env.HARBOR_PROJECT_NAME}/repositories/${name}`,
      {
        method: "DELETE",
        headers,
      },
    ).then((response) => {
      if (!response.ok && response.status !== 404) {
        // ^ 404 means the repository doesn't exist, so it has already been deleted or was never created
        throw new Error(response.statusText);
      }
    });
  }

  async getRepositoriesByProject(projectName: string) {
    const response = await fetch(
      `${env.REGISTRY_PROTOCOL}://${env.REGISTRY_HOSTNAME}/api/v2.0/projects/${projectName}/repositories`,
    );

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    return (await response.json()) as HarborRepository[];
  }

  async getImageConfig(reference: string): Promise<ImageConfig> {
    if (env.IN_TILT && reference.startsWith("localhost:")) {
      // When we're in a Tilt development environment, the builder image environment variables contain
      // references to a registry at `localhost`. This works from the host machine, but it doesn't work from inside
      // the container. Instead, we need to replace it with the cluster-internal hostname.
      reference = reference.replace(
        /^localhost:\d+\//,
        env.REGISTRY_HOSTNAME + "/",
      );
    }

    let username = "";
    let password = "";
    if (
      reference.startsWith(
        `${env.REGISTRY_HOSTNAME}/${env.HARBOR_PROJECT_NAME}`,
      )
    ) {
      username = env.IMAGE_PULL_USERNAME;
      password = env.IMAGE_PULL_PASSWORD;
    }

    return await regclient.getImageConfig(
      reference,
      username,
      password,
      env.REGISTRY_HOSTNAME,
      env.REGISTRY_PROTOCOL !== "http" ? "enabled" : "disabled",
    );
  }
}
