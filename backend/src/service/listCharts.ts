import { env } from "../lib/env.ts";
import { getChart } from "../lib/helm.ts";
import { getRepositoriesByProject } from "../lib/registry.ts";

export async function listCharts() {
  const repos = await getRepositoriesByProject(env.CHART_PROJECT_NAME);
  return await Promise.all(
    repos.map(async (repo) => {
      const url = `oci://${env.REGISTRY_HOSTNAME}/${repo.name}`;
      const chart = await getChart(url);
      return {
        name: chart.name,
        note: chart.annotations["anvilops-note"],
        url,
        urlType: "oci",
        version: chart.version,
        valueSpec: JSON.parse(chart.annotations["anvilops-values"] ?? ""),
      };
    }),
  );
}
