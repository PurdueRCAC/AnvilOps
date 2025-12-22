import { components } from "../generated/openapi.ts";

export type GitWorkloadConfig =
  components["schemas"]["WorkloadConfigOptions"] & { source: "git" };

export type ImageWorkloadConfig =
  components["schemas"]["WorkloadConfigOptions"] & { source: "image" };
