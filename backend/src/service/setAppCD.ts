import { db } from "../db/index.ts";
import { AppNotFoundError } from "./common/errors.ts";

export async function setAppCD(
  appId: number,
  userId: number,
  cdEnabled: boolean,
) {
  const app = await db.app.getById(appId, {
    requireUser: { id: userId },
  });

  if (!app) {
    throw new AppNotFoundError();
  }

  await db.app.setEnableCD(appId, cdEnabled);
}
