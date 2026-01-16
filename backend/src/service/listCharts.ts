import { getOrCreate } from "../lib/cache.ts";
import { env } from "../lib/env.ts";
import { getChartToken, getLatestChart } from "../lib/helm.ts";
import { getRepositoriesByProject } from "../lib/registry.ts";
import { ValidationError } from "./common/errors.ts";

export async function listCharts() {
  if (!env.ALLOW_HELM_DEPLOYMENTS) {
    throw new ValidationError("Helm deployments are disabled");
  }
  return JSON.parse(
    await getOrCreate("charts", 60 * 60, async () =>
      JSON.stringify(await listChartsFromRegistry()),
    ),
  );
}

const listChartsFromRegistry = async () => {
  const [repos, token] = await Promise.all([
    getRepositoriesByProject(env.CHART_PROJECT_NAME),
    getChartToken(),
  ]);

  const charts = await Promise.all(
    repos.map(async (repo) => {
      return await getLatestChart(repo.name, token);
    }),
  );

  return charts.filter(Boolean).map((chart) => ({
    name: chart.name,
    note: chart.note,
    url: `oci://${env.REGISTRY_HOSTNAME}/${env.CHART_PROJECT_NAME}/${chart.name}`,
    urlType: "oci",
    version: chart.version,
    valueSpec: chart.values,
  }));
};
