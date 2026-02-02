import { ApiException } from "@kubernetes/client-node";
import { svcK8s } from "../lib/cluster/kubernetes.ts";
import { isRFC1123 } from "../lib/validate.ts";
import { ValidationError } from "./errors/index.ts";

export class IsNamespaceAvailableService {
  async isNamespaceAvailable(namespace: string) {
    if (!isRFC1123(namespace)) {
      throw new ValidationError("Invalid namespace");
    }

    const api = svcK8s["CoreV1Api"];
    try {
      await api.readNamespace({ name: namespace });
      return false;
    } catch (e) {
      if (e instanceof ApiException && e.code === 404) {
        return true;
      }
      throw e;
    }
  }
}
