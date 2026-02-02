import type { AppRepo } from "../db/repo/app.ts";
import { AppNotFoundError } from "./errors/index.ts";

export class SetAppCDService {
  private appRepo: AppRepo;

  constructor(appRepo: AppRepo) {
    this.appRepo = appRepo;
  }

  async setAppCD(appId: number, userId: number, cdEnabled: boolean) {
    const app = await this.appRepo.getById(appId, {
      requireUser: { id: userId },
    });

    if (!app) {
      throw new AppNotFoundError();
    }

    await this.appRepo.setEnableCD(appId, cdEnabled);
  }
}
