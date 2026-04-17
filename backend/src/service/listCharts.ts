import { getOrCreate } from "../lib/cache.ts";
import { env } from "../lib/env.ts";
import {
  getChartRepositories,
  getChartToken,
  getLatestChart,
} from "../lib/helm.ts";
import { ValidationError } from "./common/errors.ts";

export async function listCharts() {
  if (!env.ALLOW_HELM_DEPLOYMENTS) {
    throw new ValidationError("Helm deployments are disabled");
  }
  return JSON.parse(
    await getOrCreate("charts", 60 * 60, async () =>
      JSON.stringify(await listChartsFromRegistry()),
    ),
  ) as Awaited<ReturnType<typeof listChartsFromRegistry>>;
}

async function listChartsFromRegistry() {
  const [repos, token] = await Promise.all([
    getChartRepositories(),
    getChartToken(),
  ]);

  const charts = await Promise.all(
    repos.map(async (repo) => {
      return await getLatestChart(repo.name, token).catch((): null => null); // A warning is printed in getChart
    }),
  );

  return charts.filter(Boolean).map((chart) => ({
    name: chart.name,
    description: chart.description,
    note: chart.note,
    url: `oci://${env.CHART_REGISTRY_HOSTNAME}/${env.CHART_PROJECT_NAME}/${chart.name}`,
    urlType: "oci",
    version: chart.version,
    watchLabels: chart.watchLabels,
    valueSpec: chart.anvilopsValues,
  }));
}
