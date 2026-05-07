import { resolve4, resolveCname, resolveTxt } from "node:dns/promises";
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
  const cnameDomain = "cname-domain.test.local";
  const svc = new CustomDomainService(null, cnameDomain);

  vi.clearAllMocks();
  vi.mocked(resolve4).mockResolvedValue(["1.1.1.1"]);
  vi.mocked(resolveTxt).mockResolvedValue([
    ["_anvilops_domain_verification=verification123"],
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
    `[Error: Could not find matching TXT record]`,
  );

  // Missing TXT record
  vi.clearAllMocks();
  vi.mocked(resolve4).mockResolvedValue(["1.1.1.1"]);
  vi.mocked(resolveTxt).mockResolvedValue([]);

  await expect(
    svc.verifyDNSRecords("top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Could not find matching TXT record]`,
  );

  // Missing A record
  vi.clearAllMocks();
  vi.mocked(resolve4).mockImplementation((host) =>
    Promise.resolve(host === cnameDomain ? ["1.1.1.1"] : []),
  );
  vi.mocked(resolveTxt).mockResolvedValue([
    ["_anvilops_domain_verification=verification123"],
  ]);
  await expect(
    svc.verifyDNSRecords("top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Could not find matching A record]`,
  );

  // Missing both records
  vi.clearAllMocks();
  vi.mocked(resolve4).mockImplementation((host) =>
    Promise.resolve(host === cnameDomain ? ["1.1.1.1"] : []),
  );
  vi.mocked(resolveTxt).mockResolvedValue([]);
  await expect(
    svc.verifyDNSRecords("top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Could not find matching A record]`,
  );

  // Invalid A record
  vi.clearAllMocks();
  vi.mocked(resolve4).mockImplementation((host) =>
    Promise.resolve(host === cnameDomain ? ["1.1.1.1"] : ["2.2.2.2"]),
  );
  vi.mocked(resolveTxt).mockResolvedValue([
    ["_anvilops_domain_verification=verification123"],
  ]);
  await expect(
    svc.verifyDNSRecords("top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Could not find matching A record]`,
  );

  // CNAMEs aren't acceptable in place of A records for top-level domains
  vi.clearAllMocks();
  vi.mocked(resolve4).mockImplementation((host) =>
    Promise.resolve(host === cnameDomain ? ["1.1.1.1"] : []),
  );
  vi.mocked(resolveCname).mockResolvedValue(["cname-domain.test.local"]);
  vi.mocked(resolveTxt).mockResolvedValue([
    ["_anvilops_domain_verification=verification123"],
  ]);
  await expect(
    svc.verifyDNSRecords("top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Could not find matching A record]`,
  );

  // TXT record with multiple entries
  vi.clearAllMocks();
  vi.mocked(resolve4).mockResolvedValue(["1.1.1.1"]);
  vi.mocked(resolveTxt).mockResolvedValue([
    [
      "extra-entry-1",
      "_anvilops_domain_verification=verification123",
      "extra-entry-2",
    ],
  ]);
  expect(await svc.verifyDNSRecords("top-level.local", "verification123")).toBe(
    true,
  );
});

test("verify subdomain", async () => {
  const svc = new CustomDomainService(null, "cname-domain.test.local");

  vi.clearAllMocks();
  vi.mocked(resolveCname).mockResolvedValue(["cname-domain.test.local"]);
  vi.mocked(resolveTxt).mockResolvedValue([
    ["_anvilops_domain_verification=verification123"],
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
    `[Error: Could not find matching TXT record]`,
  );

  // Missing TXT record
  vi.clearAllMocks();
  vi.mocked(resolveCname).mockResolvedValue(["cname-domain.test.local"]);
  vi.mocked(resolveTxt).mockResolvedValue([[]]);

  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Could not find matching TXT record]`,
  );

  // Missing CNAME record
  vi.clearAllMocks();
  vi.mocked(resolveCname).mockResolvedValue([]);
  vi.mocked(resolveTxt).mockResolvedValue([
    ["_anvilops_domain_verification=verification123"],
  ]);
  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Could not find matching CNAME record]`,
  );

  // Missing both records
  vi.clearAllMocks();
  vi.mocked(resolveCname).mockResolvedValue([]);
  vi.mocked(resolveTxt).mockResolvedValue([]);
  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Could not find matching CNAME record]`,
  );

  // Invalid CNAME record
  vi.clearAllMocks();
  vi.mocked(resolveCname).mockResolvedValue([
    "incorrect-cname-domain.test.local",
  ]);
  vi.mocked(resolveTxt).mockResolvedValue([
    ["_anvilops_domain_verification=verification123"],
  ]);
  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Could not find matching CNAME record]`,
  );

  // A records aren't acceptable in place of CNAME records for subdomains
  vi.clearAllMocks();
  vi.mocked(resolve4).mockResolvedValue(["1.1.1.1"]);
  vi.mocked(resolveCname).mockResolvedValue([]);
  vi.mocked(resolveTxt).mockResolvedValue([
    ["_anvilops_domain_verification=verification123"],
  ]);
  await expect(
    svc.verifyDNSRecords("sub.top-level.local", "verification123"),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Could not find matching CNAME record]`,
  );
});
