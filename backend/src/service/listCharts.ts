import { type KVCacheService } from "./common/cache.ts";
import type { HelmService } from "./common/helm.ts";
import type { RegistryService } from "./common/registry.ts";
import { ValidationError } from "./errors/index.ts";

export class ListChartsService {
  private registryService: RegistryService;
  private helmService: HelmService;
  private cacheService: KVCacheService;
  private helmDeploymentsEnabled: boolean;
  private registryHostname: string;
  private chartProjectName: string;

  constructor(
    registryService: RegistryService,
    helmService: HelmService,
    cacheService: KVCacheService,
    helmDeploymentsEnabled: boolean,
    registryHostname: string,
    chartProjectName: string,
  ) {
    this.registryService = registryService;
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
      this.registryService.getRepositoriesByProject(this.chartProjectName),
      this.helmService.getChartToken(),
    ]);

    const charts = await Promise.all(
      repos.map(async (repo) => {
        return await this.helmService.getLatestChart(repo.name, token);
      }),
    );

    return charts.filter(Boolean).map((chart) => ({
      name: chart.name,
      note: chart.note,
      url: `oci://${this.registryHostname}/${this.chartProjectName}/${chart.name}`,
      urlType: "oci",
      version: chart.version,
      valueSpec: chart.values,
    }));
  }
}
