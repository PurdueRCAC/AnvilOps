import { getOrCreate } from "../lib/cache.ts";
import { env } from "../lib/env.ts";
import { getChart } from "../lib/helm.ts";
import { getRepositoriesByProject } from "../lib/registry.ts";

export async function listCharts() {
  return JSON.parse(
    await getOrCreate("charts", 60 * 60, async () =>
      JSON.stringify(await listChartsFromRegistry()),
    ),
  );
}

const listChartsFromRegistry = async () => {
  const repos = await getRepositoriesByProject(env.CHART_PROJECT_NAME);
  const charts = await Promise.all(
    repos.map(async (repo) => {
      const url = `oci://${env.REGISTRY_HOSTNAME}/${repo.name}`;
      return await getChart(url);
    }),
  );

  if (charts.some((chart) => chart === null)) {
    throw new Error("Failed to get charts");
  }

  return charts
    .filter(
      (chart) => chart?.annotations && "anvilops-values" in chart?.annotations,
    )
    .map((chart) => ({
      name: chart.name,
      note: chart.annotations["anvilops-note"],
      url: `oci://${env.REGISTRY_HOSTNAME}/${chart.name}`,
      urlType: "oci",
      version: chart.version,
      valueSpec: JSON.parse(chart.annotations["anvilops-values"] ?? ""),
    }));
};
