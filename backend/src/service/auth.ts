import * as client from "openid-client";
import type { UserRepo } from "../db/repo/user.ts";
import { logger } from "../logger.ts";
import type { RancherService } from "./common/cluster/rancher.ts";
import { InvalidIDPError, RancherIDNotFoundError } from "./errors/index.ts";

export class AuthService {
  private userRepo: UserRepo;
  private rancherService: RancherService;
  private config: Promise<{ oidcConfig: client.Configuration; scope: string }>;

  private usingRancherOIDC: boolean;
  private baseURL: string;
  private rancherBaseURL: string;
  private ciLogonAllowedIdps: string[];
  private clientId: string;
  private clientSecret: string;
  private loginClaim: string;

  constructor(
    userRepo: UserRepo,
    rancherService: RancherService,
    useRancherOIDC: boolean,
    baseURL: string,
    rancherBaseURL: string,
    ciLogonAllowedIdps: string[],
    clientId: string,
    clientSecret: string,
    loginClaim: string,
  ) {
    this.userRepo = userRepo;
    this.rancherService = rancherService;
    this.config = this.getOIDCConfig();
    this.usingRancherOIDC =
      this.rancherService.isRancherManaged() && useRancherOIDC;
    this.baseURL = baseURL;
    this.rancherBaseURL = rancherBaseURL;
    this.ciLogonAllowedIdps = ciLogonAllowedIdps;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.loginClaim = loginClaim;
  }

  usingCILogon() {
    return !this.usingRancherOIDC;
  }

  getLogoutURL() {
    return this.usingCILogon()
      ? "https://cilogon.org/logout/?skin=access"
      : this.baseURL;
  }

  async getOIDCConfig() {
    if (this.usingRancherOIDC) {
      const server = new URL(
        `${this.rancherBaseURL}/oidc/.well-known/openid-configuration`,
      );
      return {
        scope: "openid profile",
        oidcConfig: await client.discovery(
          server,
          this.clientId,
          this.clientSecret,
        ),
      };
    } else {
      const server = new URL(
        "https://cilogon.org/.well-known/openid-configuration",
      );
      return {
        scope: "openid email profile org.cilogon.userinfo",
        oidcConfig: await client.discovery(
          server,
          this.clientId,
          this.clientSecret,
        ),
      };
    }
  }

  async handleLogin() {
    const code_verifier = client.randomPKCECodeVerifier();
    const code_challenge =
      await client.calculatePKCECodeChallenge(code_verifier);

    let nonce = undefined;

    const { oidcConfig, scope } = await this.config;
    if (!oidcConfig.serverMetadata().supportsPKCE()) {
      nonce = client.randomNonce();
    }

    const params: Record<string, string> = {
      code_verifier,
      code_challenge,
      code_challenge_method: "S256",
      scope,
      redirect_uri: this.baseURL + "/api/oauth_callback",
      ...(nonce && { nonce }),
      ...(this.usingCILogon() && {
        selected_idp: this.ciLogonAllowedIdps[0],
        idp_hint: this.ciLogonAllowedIdps[0],
      }),
    };

    const redirect_to = client.buildAuthorizationUrl(oidcConfig, params);
    return { redirect_to: redirect_to.toString(), nonce, code_verifier };
  }

  async handleOAuthCallback(
    currentUrl: string,
    pkceCodeVerifier: string,
    expectedNonce: string,
  ) {
    const { oidcConfig } = await this.config;
    const tokens = await client.authorizationCodeGrant(
      oidcConfig,
      new URL(currentUrl),
      {
        pkceCodeVerifier,
        expectedNonce,
        idTokenExpected: true,
      },
    );

    const claims = tokens.claims();

    if (
      this.usingCILogon() &&
      !this.ciLogonAllowedIdps.includes((claims.idp as string).toString())
    ) {
      throw new InvalidIDPError();
    }
    const existingUser = await this.userRepo.getByOIDCUserId(claims.sub);

    if (existingUser) {
      logger.info({ userId: existingUser.id }, "User logged in");
      return existingUser;
    } else {
      const clusterUsername = await this.getClusterUsername(claims);

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

  async getClusterUsername(claims: client.IDToken) {
    if (this.usingRancherOIDC) {
      return claims.sub;
    }

    if (this.rancherService.isRancherManaged()) {
      const principalIdValue = this.getPrincipalIdValue(claims);
      const rancherId =
        await this.rancherService.getRancherUserID(principalIdValue);
      if (!rancherId) {
        throw new RancherIDNotFoundError();
      }
      return rancherId;
    }

    return null;
  }

  private getPrincipalIdValue(claims: client.IDToken) {
    if (process.env._PURDUE_GEDDES) {
      // On Purdue's Geddes cluster, Rancher is not configured to use a claim available from CILogon as a principalId.
      // Rather, it uses the Purdue-specific UID:
      const email = claims.email as string | undefined;
      return email?.replace("@purdue.edu", "");
    }
    return claims[this.loginClaim] as string;
  }
}
