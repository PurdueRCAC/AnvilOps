import { ApiException } from "@kubernetes/client-node";
import { isRFC1123 } from "../lib/validate.ts";
import type { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import { ValidationError } from "./errors/index.ts";

export class IsNamespaceAvailableService {
  private kubernetesService: KubernetesClientService;

  constructor(kubernetesService: KubernetesClientService) {
    this.kubernetesService = kubernetesService;
  }

  async isNamespaceAvailable(namespace: string) {
    if (!isRFC1123(namespace)) {
      throw new ValidationError("Invalid namespace");
    }

    try {
      await this.kubernetesService.readNamespace({ name: namespace });
      return false;
    } catch (e) {
      if (e instanceof ApiException && e.code === 404) {
        return true;
      }
      throw e;
    }
  }
}
