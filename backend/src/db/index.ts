import { PrismaPg } from "@prisma/adapter-pg";
import type { DefaultArgs } from "@prisma/client/runtime/client";
import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import { Pool, type Notification } from "pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { AppRepo } from "./repo/app.ts";
import { AppGroupRepo } from "./repo/appGroup.ts";
import { CacheRepo } from "./repo/cache.ts";
import { DeploymentRepo } from "./repo/deployment.ts";
import { DomainRepo } from "./repo/domain.ts";
import { InvitationRepo } from "./repo/invitation.ts";
import { LogRepo } from "./repo/logs.ts";
import { OrganizationRepo } from "./repo/organization.ts";
import { RepoImportStateRepo } from "./repo/repoImportState.ts";
import { UserRepo } from "./repo/user.ts";

export type PrismaClientType = PrismaClient<
  never,
  {
    /* omit */ deployment: {
      secret: true;
    };
  },
  DefaultArgs
>;

export abstract class Database {
  abstract app: AppRepo;
  abstract appGroup: AppGroupRepo;
  abstract cache: CacheRepo;
  abstract deployment: DeploymentRepo;
  abstract invitation: InvitationRepo;
  abstract org: OrganizationRepo;
  abstract repoImportState: RepoImportStateRepo;
  abstract user: UserRepo;
  abstract domain: DomainRepo;
  abstract log: LogRepo;
  abstract sessionStore: session.Store;
  abstract subscribe(
    channel: string,
    callback: (msg: Notification) => void,
  ): Promise<() => Promise<void>>;
  abstract publish(channel: string, payload: string): Promise<void>;
}

/**
 * A Prisma + Postgres database implementation
 */
export class PrismaDatabase extends Database {
  private client: PrismaClientType;
  app: AppRepo;
  appGroup: AppGroupRepo;
  cache: CacheRepo;
  deployment: DeploymentRepo;
  invitation: InvitationRepo;
  org: OrganizationRepo;
  repoImportState: RepoImportStateRepo;
  user: UserRepo;
  domain: DomainRepo;
  log: LogRepo;
  sessionStore: session.Store;

  constructor(client: PrismaClientType, masterKey: Buffer) {
    super();
    this.client = client;
    this.appGroup = new AppGroupRepo(this.client);
    this.cache = new CacheRepo(this.client, masterKey);
    this.deployment = new DeploymentRepo(
      this.client,
      this.publish.bind(this),
      masterKey,
    );
    this.app = new AppRepo(this.client, this.deployment);
    this.invitation = new InvitationRepo(this.client);
    this.org = new OrganizationRepo(this.client);
    this.repoImportState = new RepoImportStateRepo(this.client);
    this.user = new UserRepo(this.client);
    this.domain = new DomainRepo(this.client);
    this.log = new LogRepo(this.client);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  subscribe(
    channel: string,
    callback: (msg: Notification) => void,
  ): Promise<() => Promise<void>> {
    throw new Error("Method not implemented.");
  }
  publish(channel: string, payload: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

export class PgDatabase extends PrismaDatabase {
  private pool: Pool;

  constructor(connectionString: string, masterKey: Buffer) {
    const prismaPostgresAdapter = new PrismaPg({ connectionString });

    const client = new PrismaClient({
      adapter: prismaPostgresAdapter,
      omit: {
        deployment: {
          secret: true,
        },
      },
    });
    super(client, masterKey);
    this.pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
    });
    this.sessionStore = new (connectPgSimple(session))({
      conString: connectionString,
    });
  }

  /**
   * Subscribes to the given channel and runs the callback when a message is received on that channel.
   *
   * @returns A cleanup function to remove the listener
   */
  override async subscribe(
    channel: string,
    callback: (msg: Notification) => void,
  ) {
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
  override async publish(channel: string, payload: string) {
    await this.pool.query("SELECT pg_notify($1, $2);", [channel, payload]);
  }
}
