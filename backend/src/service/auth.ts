import * as client from "openid-client";
import type { UserRepo } from "../db/repo/user.ts";
import { env, parseCsv } from "../lib/env.ts";
import { logger } from "../logger.ts";
import type { RancherService } from "./common/cluster/rancher.ts";
import { InvalidIDPError, RancherIDNotFoundError } from "./errors/index.ts";

const clientID = env.CLIENT_ID;
const clientSecret = env.CLIENT_SECRET;
const server = new URL("https://cilogon.org/.well-known/openid-configuration");
const redirect_uri = env.BASE_URL + "/api/oauth_callback";

let config: client.Configuration;
const getConfig = async () => {
  if (!config) config = await client.discovery(server, clientID, clientSecret);
  return config;
};
const code_challenge_method = "S256";
const scope = "openid email profile org.cilogon.userinfo";
const allowedIdps = parseCsv(env.ALLOWED_IDPS);

const getIdentity = (claims: client.IDToken) => {
  if (process.env._PURDUE_GEDDES) {
    // On Purdue's Geddes cluster, Rancher is not configured to use a claim available from CILogon as a principalId.
    // Rather, it uses the Purdue-specific UID:
    const email = claims.email as string;
    return email.replace("@purdue.edu", "");
  }

  return claims[env.LOGIN_CLAIM] as string;
};

export class AuthService {
  private userRepo: UserRepo;
  private rancherService: RancherService;

  constructor(userRepo: UserRepo, rancherService: RancherService) {
    this.userRepo = userRepo;
    this.rancherService = rancherService;
  }

  async handleLogin() {
    const code_verifier = client.randomPKCECodeVerifier();
    const code_challenge =
      await client.calculatePKCECodeChallenge(code_verifier);

    let nonce = undefined;

    const config = await getConfig();
    if (!config.serverMetadata().supportsPKCE()) {
      nonce = client.randomNonce();
    }

    const params: Record<string, string> = {
      code_verifier,
      code_challenge,
      code_challenge_method,
      scope,
      redirect_uri,
      nonce,
    };

    const redirect_to = client.buildAuthorizationUrl(config, params);
    params["redirect_to"] = redirect_to.toString();

    return params;
  }

  async handleOAuthCallback(
    currentUrl: string,
    pkceCodeVerifier: string,
    expectedNonce: string,
  ) {
    const tokens = await client.authorizationCodeGrant(
      await getConfig(),
      new URL(currentUrl),
      {
        pkceCodeVerifier,
        expectedNonce,
        idTokenExpected: true,
      },
    );

    const claims = tokens.claims();

    if (
      allowedIdps &&
      !allowedIdps.includes((claims.idp as string).toString())
    ) {
      throw new InvalidIDPError();
    }
    const existingUser = await this.userRepo.getByCILogonUserId(claims.sub);

    if (existingUser) {
      logger.info({ userId: existingUser.id }, "User logged in");
      return existingUser;
    } else {
      let clusterUsername: string;
      if (this.rancherService.isRancherManaged()) {
        const identity = getIdentity(claims);
        try {
          clusterUsername =
            await this.rancherService.getRancherUserID(identity);
          if (!clusterUsername) {
            throw new Error();
          }
        } catch (e) {
          logger.error(e, "Failed to fetch user's Rancher user ID");
          throw new RancherIDNotFoundError();
        }
      }

      const newUser = await this.userRepo.createUserWithPersonalOrg(
        claims.email as string,
        claims.name as string,
        claims.sub,
        clusterUsername,
      );

      logger.info(newUser, "User signed up");
      return newUser;
    }
  }
}
