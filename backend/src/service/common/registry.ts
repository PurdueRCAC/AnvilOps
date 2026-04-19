import type { ImageConfig } from "regclient-napi";
import * as regclient from "regclient-napi";
import { logger } from "../../logger.ts";

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

    const res = await fetch(
      `${this.registryProtocol}://${this.registryHostname}/api/v2.0/projects/${this.harborProjectName}/repositories/${name}`,
      {
        method: "DELETE",
        headers,
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) {
      throw new Error(
        `Failed to delete image repository ${name}: ${res.status} ${res.statusText}`,
      );
    }
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
