import type { components } from "@/generated/openapi";
import { clsx, type ClassValue } from "clsx";
import React from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounceValue, setDebounceValue] = React.useState<T>(value);
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebounceValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debounceValue;
}

/**
 * Type guard to check if a DeploymentConfig is a WorkloadConfigOptions
 * (i.e., not a HelmConfigOptions)
 */
export function isWorkloadConfig(
  config: components["schemas"]["DeploymentConfig"],
): config is components["schemas"]["WorkloadConfigOptions"] {
  return config.source !== "helm";
}
