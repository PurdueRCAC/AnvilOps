import { PrismaPg } from "@prisma/adapter-pg";
import type { DefaultArgs } from "@prisma/client/runtime/client";
import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import { Pool, type Notification } from "pg";
import "../../prisma/types.js";
import { PrismaClient } from "../generated/prisma/client.ts";
import { env } from "../lib/env.ts";
import { AppRepo } from "./repo/app.ts";
import { AppGroupRepo } from "./repo/appGroup.ts";
import { CacheRepo } from "./repo/cache.ts";
import { DeploymentRepo } from "./repo/deployment.ts";
import { InvitationRepo } from "./repo/invitation.ts";
import { OrganizationRepo } from "./repo/organization.ts";
import { RepoImportStateRepo } from "./repo/repoImportState.ts";
import { UserRepo } from "./repo/user.ts";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export type PrismaClientType = PrismaClient<
  never,
  {
    /* omit */ deployment: {
      secret: true;
    };
  },
  DefaultArgs
>;

/**
 * A Postgres database implementation
 */
export class Database {
  private DATABASE_URL =
    env.DATABASE_URL ??
    `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@${env.POSTGRES_HOSTNAME}/${env.POSTGRES_DB}`;

  private pool = new Pool({
    connectionString: this.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });

  private prismaPostgresAdapter = new PrismaPg({
    connectionString: this.DATABASE_URL,
  });

  private client: PrismaClientType = new PrismaClient({
    adapter: this.prismaPostgresAdapter,
    omit: {
      deployment: {
        secret: true,
      },
    },
  });

  app = new AppRepo(this.client);

  appGroup = new AppGroupRepo(this.client);

  cache = new CacheRepo(this.client);

  deployment = new DeploymentRepo(this.client, this.publish.bind(this));

  invitation = new InvitationRepo(this.client);

  org = new OrganizationRepo(this.client);

  repoImportState = new RepoImportStateRepo(this.client);

  user = new UserRepo(this.client);

  sessionStore = new (connectPgSimple(session))({
    conString: this.DATABASE_URL,
  });

  /**
   * Subscribes to the given channel and runs the callback when a message is received on that channel.
   *
   * @returns A cleanup function to remove the listener
   */
  async subscribe(channel: string, callback: (msg: Notification) => void) {
    const conn = await this.pool.connect();
    if (!channel.match(/^[a-zA-Z0-9_]+$/g)) {
      // Sanitize against potential SQL injection. Postgres unfortunately doesn't provide a way to parameterize the
      // channel name for LISTEN and UNLISTEN, so we validate that the channel name is a valid SQL identifier here.
      throw new Error(
        "Invalid channel name: '" +
          channel +
          "'. Expected only letters, numbers, and underscores.",
      );
    }

    const listener = (msg: Notification) => {
      if (msg.channel === channel) {
        callback(msg);
      }
    };
    conn.on("notification", listener);

    await conn.query(`LISTEN "${channel}"`);

    return async () => {
      await conn.query(`UNLISTEN "${channel}"`);
      conn.off("notification", listener);
      conn.release();
    };
  }

  /**
   * Publishes a message on the given channel.
   * @see {subscribe}
   * @param channel The channel to publish on
   * @param payload The message to publish
   */
  async publish(channel: string, payload: string) {
    await this.pool.query("SELECT pg_notify($1, $2);", [channel, payload]);
  }
}

export const db = new Database();
