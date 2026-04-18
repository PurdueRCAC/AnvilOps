import { env } from "../lib/env.ts";
import { type KVCacheService } from "./common/cache.ts";
import type { HelmService } from "./common/helm.ts";
import type { RegistryService } from "./common/registry.ts";
import { ValidationError } from "./errors/index.ts";

export class ListChartsService {
  private registryService: RegistryService;
  private helmService: HelmService;
  private cacheService: KVCacheService;

  constructor(
    registryService: RegistryService,
    helmService: HelmService,
    cacheService: KVCacheService,
  ) {
    this.registryService = registryService;
    this.helmService = helmService;
    this.cacheService = cacheService;
  }

  async listCharts() {
    if (!env.ALLOW_HELM_DEPLOYMENTS) {
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
      this.registryService.getRepositoriesByProject(env.CHART_PROJECT_NAME),
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
      url: `oci://${env.REGISTRY_HOSTNAME}/${env.CHART_PROJECT_NAME}/${chart.name}`,
      urlType: "oci",
      version: chart.version,
      valueSpec: chart.values,
    }));
  }
}
