import { type KVCacheService } from "./common/cache.ts";
import type { HelmService } from "./common/helm.ts";
import { ChartsMissingError, ValidationError } from "./errors/index.ts";

export class ListChartsService {
  private helmService: HelmService;
  private cacheService: KVCacheService;
  private helmDeploymentsEnabled: boolean;
  private registryHostname: string;
  private chartProjectName: string;

  constructor(
    helmService: HelmService,
    cacheService: KVCacheService,
    helmDeploymentsEnabled: boolean,
    registryHostname: string,
    chartProjectName: string,
  ) {
    this.helmService = helmService;
    this.cacheService = cacheService;
    this.helmDeploymentsEnabled = helmDeploymentsEnabled;
    this.registryHostname = registryHostname;
    this.chartProjectName = chartProjectName;
  }

  async listCharts() {
    if (!this.helmDeploymentsEnabled) {
      throw new ValidationError("Helm deployments are disabled");
    }
    return JSON.parse(
      await this.cacheService.getOrCreate("charts", 60 * 60, async () =>
        JSON.stringify(await this.listChartsFromRegistry()),
      ),
    ) as Awaited<ReturnType<typeof this.listChartsFromRegistry>>;
  }

  async listChartsFromRegistry() {
    const [repos, token] = await Promise.all([
      this.helmService.getChartRepositories(),
      this.helmService.getChartToken(),
    ]);

    const charts = await Promise.all(
      repos.map(async (repo) => {
        return await this.helmService
          .getLatestChart(repo.name, token)
          .catch((): null => null); // A warning is printed in getChart
      }),
    );

    const validCharts = charts.filter(Boolean);
    if (validCharts.length == 0) {
      throw new ChartsMissingError();
    }

    return validCharts.map((chart) => ({
      name: chart.name,
      description: chart.description,
      note: chart.note,
      url: `oci://${this.registryHostname}/${chart.repoName}`,
      urlType: "oci",
      version: chart.version,
      watchLabels: chart.watchLabels,
      valueSpec: chart.anvilopsValues,
    }));
  }
}
