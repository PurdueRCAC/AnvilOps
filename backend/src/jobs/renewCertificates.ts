import { setTimeout } from "node:timers/promises";
import { PgDatabase, type Database } from "../db/index.ts";
import { logger } from "../logger.ts";
import { CertGenerationService } from "../service/certGeneration.ts";
import { KVCacheService } from "../service/common/cache.ts";
import { KubernetesClientService } from "../service/common/cluster/kubernetes.ts";
import { RancherService } from "../service/common/cluster/rancher.ts";
import { IngressConfigService } from "../service/common/cluster/resources/ingress.ts";

const db: Database = new PgDatabase(
  process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOSTNAME}/${process.env.POSTGRES_DB}`,
  Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "base64"),
);

const rancherService = new RancherService(
  process.env.RANCHER_TOKEN,
  process.env.RANCHER_BASE_URL,
  process.env.LOGIN_TYPE,
  process.env.SANDBOX_ID,
);

const kubernetesClientService = new KubernetesClientService(
  db.user,
  rancherService,
  process.env.CURRENT_NAMESPACE,
);

const ingressConfigService = new IngressConfigService(
  kubernetesClientService,
  process.env.APP_DOMAIN,
  process.env.INGRESS_CLASS_NAME,
  process.env.CURRENT_NAMESPACE,
);

const cacheService = new KVCacheService(db.cache);

const certGenService = new CertGenerationService(
  cacheService,
  db.app,
  db.domain,
  ingressConfigService,
  kubernetesClientService,
  process.env.ACME_SERVER_ADDRESS,
);

/**
 * This job renews custom domains' TLS certificates that are about to expire.
 */
async function renewCertificates() {
  const domains = await db.domain.listUpForRenewal();
  logger.info({ domainCount: domains.length }, "Renewing domains");
  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    /* eslint-disable no-await-in-loop */
    await db.domain.setStatus(domain.id, "PENDING");
    await certGenService.generateCert(domain.id);

    const isLast = i == domains.length - 1;
    if (!isLast) {
      // Wait 5 seconds between domains just in case the ACME endpoint has a rate limit
      await setTimeout(5000);
    }
    /* eslint-enable no-await-in-loop */
  }
}

await renewCertificates();
