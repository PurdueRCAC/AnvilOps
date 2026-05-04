import type { AnyRecord } from "node:dns";
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
    const records = await dns.resolveAny(domainName);

    const isValid = expectedRecords.every((expected) =>
      records.some((actual) => this.dnsRecordMatches(expected, actual)),
    );
    if (!isValid) {
      throw new ValidationError("DNS records are incorrect");
    }

    return true;
  }

  private dnsRecordMatches(expected: RequiredDnsRecord, actual: AnyRecord) {
    if (expected.type === "A") {
      return actual.type === "A" && actual.address === expected.content;
    } else if (expected.type === "CNAME") {
      return actual.type === "CNAME" && actual.value === expected.content;
    } else if (expected.type === "TXT") {
      return actual.type === "TXT" && actual.entries.includes(expected.content);
    }
    return false;
  }
}
