import dns from "node:dns/promises";
import { parse } from "tldts";
import { ConflictError } from "../db/errors/index.ts";
import type { DomainRepo } from "../db/repo/domain.ts";
import { PrivateSuffixError, ValidationError } from "./errors/index.ts";

interface RequiredDnsRecord {
  name: string;
  type: "CNAME" | "A" | "TXT";
  content: string;
}

// Prefer Cloudflare's DNS service - it's likely to have more up-to-date results than the system's DNS service
// https://one.one.one.one/dns/
dns.setServers([
  "1.1.1.1",
  "1.0.0.1",
  "2606:4700:4700::1111",
  "2606:4700:4700::1001",
  ...(dns.getServers() ?? []),
]);

export class CustomDomainService {
  private domainRepo: DomainRepo;
  private cnameDomain: string;

  constructor(domainRepo: DomainRepo, cnameDomain: string) {
    this.domainRepo = domainRepo;
    this.cnameDomain = cnameDomain;
  }

  validateDomainName(domain: string) {
    const info = parse(domain, { allowPrivateDomains: true });
    if (info.isPrivate) {
      throw new PrivateSuffixError();
    }
    if (!info.domain) {
      throw new ValidationError("Invalid domain name");
    }
    return info;
  }

  /**
   * Returns the DNS records that the user must set to add a custom domain with the provided name.
   */
  async getRequiredDNSRecords(domain: string, verificationToken: string) {
    const info = this.validateDomainName(domain);

    const records: RequiredDnsRecord[] = [];

    if (info.subdomain) {
      // The domain should have a CNAME that points to the app's default subdomain
      records.push({
        name: info.subdomain,
        type: "CNAME",
        content: this.cnameDomain,
      });
    } else {
      // CNAMEs aren't allowed at the apex domain, so ask for an A record instead
      const ips = await dns.resolve4(this.cnameDomain); // We know this domain points to the ingress controller, so use its public IP address
      if (ips.length === 0) {
        throw new Error("Failed to resolve address for CNAME domain");
      }
      records.push(
        ...ips.map((ip) => ({ name: "@", type: "A", content: ip }) as const),
      );
    }

    records.push({
      name: info.subdomain || "@",
      type: "TXT",
      content: `_anvilops_domain_verification=${verificationToken}`,
    });

    return records;
  }

  async create(appId: number, domain: string) {
    const existingDomains = await this.domainRepo.getByName(domain);

    if (existingDomains.length > 0) {
      throw new ConflictError();
    }

    return await this.domainRepo.create(appId, domain);
  }

  async verifyDNSRecords(domainName: string, verificationToken: string) {
    const expectedRecords = await this.getRequiredDNSRecords(
      domainName,
      verificationToken,
    );

    await Promise.all(
      expectedRecords.map(async (expected) => {
        switch (expected.type) {
          case "A": {
            const ips = await dns.resolve4(domainName);
            if (!ips.includes(expected.content)) {
              throw new ValidationError("Could not find matching A record");
            }
            break;
          }
          case "CNAME": {
            const names = await dns.resolveCname(domainName);
            if (!names.includes(expected.content)) {
              throw new ValidationError("Could not find matching CNAME record");
            }
            break;
          }
          case "TXT": {
            const records = await dns.resolveTxt(domainName);
            if (!records.some((rec) => rec.includes(expected.content))) {
              throw new ValidationError("Could not find matching TXT record");
            }
            break;
          }
          default: {
            expected.type satisfies never;
          }
        }
      }),
    );

    return true;
  }
}
