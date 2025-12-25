import { db, NotFoundError } from "../db/index.ts";
import {
  InstallationNotFoundError,
  OrgNotFoundError,
} from "./common/errors.ts";

export async function claimOrg(
  orgId: number,
  unassignedInstallationId: number,
  userId: number,
) {
  try {
    await db.org.claimInstallation(orgId, unassignedInstallationId, userId);
  } catch (e) {
    if (e instanceof NotFoundError) {
      switch (e.message) {
        case "installation":
          throw new InstallationNotFoundError(e);
        case "organization":
          throw new OrgNotFoundError(e);
      }
    }

    throw e;
  }
}
