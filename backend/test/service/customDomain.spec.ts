import { resolve4, resolveAny } from "node:dns/promises";
import { expect, test, vi } from "vitest";
import { CustomDomainService } from "../../src/service/customDomain.ts";

vi.mock("node:dns/promises");

test("required DNS records", async () => {
  const svc = new CustomDomainService(null, "cname-domain.test.local");
  vi.mocked(resolve4).mockResolvedValue(["1.1.1.1"]);

  // Top-level domains should get an A record and a TXT record
  const topLevel = await svc.getRequiredDNSRecords(
    "top-level.local",
    "verification123",
  );
  expect(topLevel).toMatchInlineSnapshot(`
    [
      {
        "content": "1.1.1.1",
        "name": "@",
        "type": "A",
      },
      {
        "content": "_anvilops_domain_verification=verification123",
        "name": "@",
        "type": "TXT",
      },
    ]
  `);

  // Subdomains should get a CNAME and a TXT
  const subdomain = await svc.getRequiredDNSRecords(
    "sub.top-level.local",
    "verification123",
  );
  expect(subdomain).toMatchInlineSnapshot(`
    [
      {
        "content": "cname-domain.test.local",
        "name": "sub",
        "type": "CNAME",
      },
      {
        "content": "_anvilops_domain_verification=verification123",
        "name": "sub",
        "type": "TXT",
      },
    ]
  `);
});

test("verify top-level domain", async () => {
  const svc = new CustomDomainService(null, "cname-domain.test.local");

  vi.mocked(resolve4).mockResolvedValue(["1.1.1.1"]);
  vi.mocked(resolveAny).mockResolvedValue([
    { type: "A", address: "1.1.1.1", ttl: 300 },
    { type: "TXT", entries: ["_anvilops_domain_verification=verification123"] },
  ]);

  const isValid = await svc.verifyDNSRecords(
    "top-level.local",
    "verification123",
  );
  expect(isValid).toBe(true);

  // Invalid verification token
  await expect(
    svc.verifyDNSRecords("top-level.local", "verification456"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // Missing TXT record
  vi.mocked(resolveAny).mockResolvedValue([
    { type: "A", address: "1.1.1.1", ttl: 300 },
  ]);

  await expect(
    svc.verifyDNSRecords("top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // Missing A record
  vi.mocked(resolveAny).mockResolvedValue([
    { type: "TXT", entries: ["_anvilops_domain_verification=verification123"] },
  ]);
  await expect(
    svc.verifyDNSRecords("top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // Missing both records
  vi.mocked(resolveAny).mockResolvedValue([]);
  await expect(
    svc.verifyDNSRecords("top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // Invalid A record
  vi.mocked(resolveAny).mockResolvedValue([
    { type: "A", address: "2.2.2.2", ttl: 300 },
    { type: "TXT", entries: ["_anvilops_domain_verification=verification123"] },
  ]);
  await expect(
    svc.verifyDNSRecords("top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // CNAMEs aren't acceptable in place of A records for top-level domains
  vi.mocked(resolveAny).mockResolvedValue([
    { type: "CNAME", value: "cname-domain.test.local" },
    { type: "TXT", entries: ["_anvilops_domain_verification=verification123"] },
  ]);
  await expect(
    svc.verifyDNSRecords("top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // TXT record with multiple entries
  vi.mocked(resolveAny).mockResolvedValue([
    { type: "A", address: "1.1.1.1", ttl: 300 },
    {
      type: "TXT",
      entries: [
        "extra-entry-1",
        "_anvilops_domain_verification=verification123",
        "extra-entry-2",
      ],
    },
  ]);
  expect(await svc.verifyDNSRecords("top-level.local", "verification123")).toBe(
    true,
  );
});

test("verify subdomain", async () => {
  const svc = new CustomDomainService(null, "cname-domain.test.local");

  vi.mocked(resolveAny).mockResolvedValue([
    { type: "CNAME", value: "cname-domain.test.local" },
    { type: "TXT", entries: ["_anvilops_domain_verification=verification123"] },
  ]);

  const isValid = await svc.verifyDNSRecords(
    "sub.top-level.local",
    "verification123",
  );
  expect(isValid).toBe(true);

  // Invalid verification token
  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification456"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // Missing TXT record
  vi.mocked(resolveAny).mockResolvedValue([
    { type: "CNAME", value: "cname-domain.test.local" },
  ]);

  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // Missing CNAME record
  vi.mocked(resolveAny).mockResolvedValue([
    { type: "TXT", entries: ["_anvilops_domain_verification=verification123"] },
  ]);
  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // Missing both records
  vi.mocked(resolveAny).mockResolvedValue([]);
  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // Invalid CNAME record
  vi.mocked(resolveAny).mockResolvedValue([
    { type: "CNAME", value: "incorrect-cname-domain.test.local" },
    { type: "TXT", entries: ["_anvilops_domain_verification=verification123"] },
  ]);
  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );

  // A records aren't acceptable in place of CNAME records for subdomains
  vi.mocked(resolveAny).mockResolvedValue([
    { type: "A", address: "1.1.1.1", ttl: 300 },
    { type: "TXT", entries: ["_anvilops_domain_verification=verification123"] },
  ]);
  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: DNS records are incorrect]`,
  );
});
