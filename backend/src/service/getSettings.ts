import { readFile } from "node:fs/promises";
import { type RancherService } from "./common/cluster/rancher.ts";

type ClusterConfig = {
  name?: string;
  faq?: {
    question?: string;
    answer?: string;
    link?: string;
  };
};

export class GetSettingsService {
  private rancherService: RancherService;
  private clusterConfigPromise: Promise<ClusterConfig> | null = null;
  private appDomain: string;
  private storageClassName: string;
  private allowHelmDeployments: boolean;
  private version: string;
  private buildDate: string;
  private inTilt: boolean;

  constructor(
    rancherService: RancherService,
    configPath: string,
    appDomain: string,
    storageClassName: string,
    allowHelmDeployments: boolean,
    version: string,
    buildDate: string,
    inTilt: boolean,
  ) {
    this.rancherService = rancherService;
    this.appDomain = appDomain;
    this.storageClassName = storageClassName;
    this.allowHelmDeployments = allowHelmDeployments;
    this.version = version;
    this.buildDate = buildDate;
    this.inTilt = inTilt;

    if (configPath) {
      this.clusterConfigPromise = readFile(configPath).then(
        (file) => JSON.parse(file.toString()) as ClusterConfig,
      );
    }
  }

  async getSettings() {
    const clusterConfig = await this.clusterConfigPromise;

    return {
      appDomain: this.appDomain,
      version: this.getVersionString(),
      clusterName: clusterConfig?.name,
      faq: clusterConfig?.faq,
      storageEnabled: this.storageClassName !== undefined,
      isRancherManaged: this.rancherService.isRancherManaged(),
      allowHelmDeployments: this.allowHelmDeployments,
    };
  }

  getVersionString() {
    let version = this.version;
    if (this.buildDate) {
      version += " (" + new Date(this.buildDate).toLocaleDateString() + ")";
    }

    if (this.inTilt) {
      version += " (dev)";
    }
    return version;
  }
}
