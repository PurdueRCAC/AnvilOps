import { db } from "../db/index.ts";
import { ValidationError } from "./common/errors.ts";

export async function isSubdomainAvailable(subdomain: string) {
  if (
    subdomain.length > 54 ||
    subdomain.match(/^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/) === null
  ) {
    throw new ValidationError("Invalid subdomain.");
  }

  const subdomainUsedByApp = await db.app.getAppBySubdomain(subdomain);
  return subdomainUsedByApp === null;
}
