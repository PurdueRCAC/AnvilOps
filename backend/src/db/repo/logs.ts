import type { PrismaClientType } from "../index.ts";

export class LogRepo {
  private client: PrismaClientType;

  constructor(client: PrismaClientType) {
    this.client = client;
  }

  async deleteLogsOlderThan(date: Date) {
    return await this.client.log.deleteMany({
      where: {
        timestamp: {
          lt: date,
        },
      },
    });
  }
}
