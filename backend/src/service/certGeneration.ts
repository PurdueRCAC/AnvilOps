import {
  AccountDoesNotExistError,
  AcmeClient,
  AcmeOrder,
  CertUtils,
  type AcmeAccount,
} from "@fishballpkg/acme";
import type { V1Secret } from "@kubernetes/client-node";
import type { webcrypto } from "node:crypto";
import type { AppRepo } from "../db/repo/app.ts";
import type { DomainRepo } from "../db/repo/domain.ts";
import { logger } from "../logger.ts";
import type { KVCacheService } from "./common/cache.ts";
import type { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import {
  createNamespaceConfig,
  type K8sObject,
} from "./common/cluster/resources.ts";
import type { IngressConfigService } from "./common/cluster/resources/ingress.ts";
import { DomainNotFoundError, ValidationError } from "./errors/index.ts";

export class CertGenerationService {
  private cacheService: KVCacheService;
  private client: AcmeClient;
  private acmeServer: string;
  private appRepo: AppRepo;
  private ingressService: IngressConfigService;
  private k8sService: KubernetesClientService;
  private domainRepo: DomainRepo;

  constructor(
    cacheService: KVCacheService,
    appRepo: AppRepo,
    domainRepo: DomainRepo,
    ingressService: IngressConfigService,
    k8sService: KubernetesClientService,
    acmeServer: string,
  ) {
    this.cacheService = cacheService;
    this.appRepo = appRepo;
    this.domainRepo = domainRepo;
    this.ingressService = ingressService;
    this.k8sService = k8sService;
    this.acmeServer = acmeServer;
  }

  private async getClient() {
    if (!this.client) {
      this.client = await AcmeClient.init(this.acmeServer);
    }
    return this.client;
  }

  private async login(isRetry: boolean = false): Promise<AcmeAccount> {
    const client = await this.getClient();
    const cacheKey =
      "acme-account-" +
      Buffer.from(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(client.directory)),
        ),
      ).toString("hex");

    type SerializedAccount = {
      publicKey: webcrypto.JsonWebKey;
      privateKey: webcrypto.JsonWebKey;
    };

    const accountStr = await this.cacheService.getOrCreate(
      cacheKey,
      60 * 60 * 24 * 365 * 10, // 10 years - we should never have to create more than one account
      async () => {
        const account = await client.createAccount({ emails: [] });
        const privateKey = await crypto.subtle.exportKey(
          "jwk",
          account.keyPair.privateKey,
        );
        const publicKey = await crypto.subtle.exportKey(
          "jwk",
          account.keyPair.publicKey,
        );
        return JSON.stringify({
          privateKey,
          publicKey,
        } satisfies SerializedAccount);
      },
      /* encrypt = */ true,
    );

    const accountJson = JSON.parse(accountStr) as SerializedAccount;
    const keyPair = {
      privateKey: await crypto.subtle.importKey(
        "jwk",
        accountJson.privateKey,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign"],
      ),
      publicKey: await crypto.subtle.importKey(
        "jwk",
        accountJson.publicKey,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"],
      ),
    };
    try {
      return await client.login({ keyPair });
    } catch (e) {
      if (e instanceof AccountDoesNotExistError) {
        if (!isRetry) {
          logger.warn(
            e,
            "Previously-used ACME account does not exist; retrying with a new account...",
          );
          // Try clearing the current account and generating a new one.
          // This probably happened because we're in development and restarted Pebble (the ACME server), which clears its state.
          await this.cacheService.remove(cacheKey);
          return await this.login(true);
        } else {
          throw e;
        }
      }
      throw e;
    }
  }

  async generateCert(domainId: number) {
    const domain = await this.domainRepo.getById(domainId);
    const account = await this.login();
    const order = await account.createOrder({ domains: [domain.name] });
    const http01Challenges = order.authorizations.map((authorization) =>
      authorization.findChallenge("http-01"),
    );
    if (http01Challenges.length !== 1) {
      throw new Error(
        "Unexpected response: got " +
          order.authorizations.length +
          " authorizations, expected 1",
      );
    }
    const challenge = http01Challenges[0];

    await this.domainRepo.updateCertOrderDetails(
      domainId,
      challenge.token,
      await challenge.keyAuthorization(),
      order.url,
    );

    // Tell the CA that we're ready to run our HTTP challenge
    await challenge.submit();

    // The rest of the process continues in handleAcmeChallenge, then in finalizeCertOrder
  }

  async handleAcmeChallenge(token: string) {
    const domain = await this.domainRepo.getByToken(token);
    if (!domain) {
      throw new DomainNotFoundError();
    }
    logger.info(
      { domain: { id: domain.id, name: domain.name } },
      "Handling ACME challenge",
    );

    if (domain.status === "GENERATING") {
      // We've already started waiting for the process to complete while handling another request; return early
      return domain.keyAuthorization;
    }

    if (domain.status === "PENDING") {
      await this.domainRepo.setStatus(domain.id, "GENERATING");
    } else {
      throw new ValidationError(
        "Unexpected domain verification status: " + domain.status,
      );
    }

    // Start waiting for the certificate to be generated
    void (async () => {
      try {
        await this.finalizeCertOrder(domain.id);
      } catch (e) {
        logger.warn(
          { err: e, domainId: domain.id },
          "Failed to generate certificate",
        );
        await this.domainRepo.setStatus(domain.id, "ERROR");
      }
    })();

    return domain.keyAuthorization;
  }

  private async finalizeCertOrder(domainId: number) {
    const domain = await this.domainRepo.getById(domainId);

    const config = await this.appRepo.getDeploymentConfig(domain.appId);
    if (config.appType !== "workload") {
      throw new ValidationError(
        "Cannot generate certificates for this kind of application.",
      );
    }

    const account = await this.login();
    const order = await AcmeOrder.init({ account, url: domain.orderURL });

    // Wait until the challenge completes
    await order.pollStatus({ pollUntil: "ready" });

    // Request a certificate
    const keyPair = await order.finalize();

    // Wait until the certificate is generated
    await order.pollStatus({ pollUntil: "valid" });

    const certificatePemContent = await order.getCertificate();

    const { notBefore, notAfter } = CertUtils.decodeValidity(
      certificatePemContent,
    );

    const exportedPrivateKey = await crypto.subtle.exportKey(
      "pkcs8",
      keyPair.privateKey,
    );

    const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(exportedPrivateKey).toString("base64")}\n-----END PRIVATE KEY-----`;

    const app = await this.appRepo.getById(domain.appId);

    // Place the new certificate into a Secret in the app's namespace
    const secret: K8sObject & V1Secret = {
      apiVersion: "v1",
      kind: "Secret",
      type: "kubernetes.io/tls",
      metadata: {
        name: `anvilops-tls-${domain.id}`,
        namespace: app.namespace,
      },
      data: {
        "tls.crt": Buffer.from(certificatePemContent).toString("base64"),
        "tls.key": Buffer.from(privateKeyPem).toString("base64"),
      },
    };

    await this.domainRepo.markAsGenerated(domainId, notBefore, notAfter);
    const domains = await this.domainRepo.listByAppId(domain.appId);
    const ingress = this.ingressService.createIngressConfig({
      createIngress: config.createIngress,
      customDomains: domains,
      name: app.name,
      namespace: app.namespace,
      port: config.port,
      serviceName: app.namespace,
      subdomain: config.subdomain,
      servicePort: 80,
    });
    // (this new Ingress config will contain a reference to the new certificate since its status is now Generated)

    const namespace = createNamespaceConfig(app.namespace, app.projectId);

    await this.k8sService.createOrUpdateApp(app, namespace, [secret, ingress]);
  }
}

declare global {
  interface CryptoKeyPair {
    privateKey: webcrypto.CryptoKey;
    publicKey: webcrypto.CryptoKey;
  }
}
