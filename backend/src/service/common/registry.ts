import type { ImageConfig } from "regclient-napi";
import * as regclient from "regclient-napi";
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
  private registryHostname: string;
  private registryProtocol: string;
  private imagePullUsername: string;
  private imagePullPassword: string;
  private deleteRepoUsername: string;
  private deleteRepoPassword: string;
  private harborProjectName: string;
  private inTilt: boolean;

  constructor(
    registryHostname: string,
    registryProtocol: string,
    imagePullUsername: string,
    imagePullPassword: string,
    deleteRepoUsername: string,
    deleteRepoPassword: string,
    harborProjectName: string,
    inTilt: boolean,
  ) {
    this.registryHostname = registryHostname;
    this.registryProtocol = registryProtocol;
    this.imagePullUsername = imagePullUsername;
    this.imagePullPassword = imagePullPassword;
    this.deleteRepoUsername = deleteRepoUsername;
    this.deleteRepoPassword = deleteRepoPassword;
    this.harborProjectName = harborProjectName;
    this.inTilt = inTilt;
  }

  async deleteRepo(name: string) {
    logger.info({ name }, "Deleting image repository");
    const headers = {
      authorization: `Basic ${Buffer.from(this.deleteRepoUsername + ":" + this.deleteRepoPassword).toString("base64")}`,
    };

    await fetch(
      `${this.registryProtocol}://${this.registryHostname}/api/v2.0/projects/${this.harborProjectName}/repositories/${name}`,
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
      `${this.registryProtocol}://${this.registryHostname}/api/v2.0/projects/${projectName}/repositories`,
    );

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    return (await response.json()) as HarborRepository[];
  }

  async getImageConfig(reference: string): Promise<ImageConfig> {
    if (this.inTilt && reference.startsWith("localhost:")) {
      // When we're in a Tilt development environment, the builder image environment variables contain
      // references to a registry at `localhost`. This works from the host machine, but it doesn't work from inside
      // the container. Instead, we need to replace it with the cluster-internal hostname.
      reference = reference.replace(
        /^localhost:\d+\//,
        this.registryHostname + "/",
      );
    }

    let username = "";
    let password = "";
    if (
      reference.startsWith(`${this.registryHostname}/${this.harborProjectName}`)
    ) {
      username = this.imagePullUsername;
      password = this.imagePullPassword;
    }

    return await regclient.getImageConfig(
      reference,
      username,
      password,
      this.registryHostname,
      this.registryProtocol !== "http" ? "enabled" : "disabled",
    );
  }
}
