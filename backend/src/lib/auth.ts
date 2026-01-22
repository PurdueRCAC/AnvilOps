import { SpanStatusCode, trace } from "@opentelemetry/api";
import express from "express";
import * as client from "openid-client";
import { db } from "../db/index.ts";
import type { operations } from "../generated/openapi.ts";
import type { AuthenticatedRequest } from "../handlers/index.ts";
import { logger } from "../index.ts";
import { getRancherUserID, isRancherManaged } from "./cluster/rancher.ts";
import { env, parseCsv } from "./env.ts";

export const SESSION_COOKIE_NAME = "anvilops_session";
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

const router = express.Router();

router.get("/login", async (req, res) => {
  const code_verifier = client.randomPKCECodeVerifier();
  const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
  (req.session as any).code_verifier = code_verifier;

  const params: Record<string, string> = {
    redirect_uri,
    scope,
    code_challenge,
    code_challenge_method,
    selected_idp: env.ALLOWED_IDPS,
    idp_hint: env.ALLOWED_IDPS,
  };

  const config = await getConfig();
  if (!config.serverMetadata().supportsPKCE()) {
    const nonce = client.randomNonce();
    (req.session as any).nonce = nonce;
    params.nonce = nonce;
  }

  const redirectTo = client.buildAuthorizationUrl(config, params);
  return res.redirect(redirectTo.toString());
});

router.get("/oauth_callback", async (req, res) => {
  try {
    const currentUrl = req.protocol + "://" + req.get("host") + req.originalUrl;
    const tokens = await client.authorizationCodeGrant(
      await getConfig(),
      new URL(currentUrl),
      {
        pkceCodeVerifier: (req.session as any).code_verifier,
        expectedNonce: (req.session as any).nonce,
        idTokenExpected: true,
      },
    );

    const claims = tokens.claims();

    if (allowedIdps && !allowedIdps.includes(claims.idp.toString())) {
      return res.redirect("/error?type=login&code=IDP_ERROR");
    }
    const existingUser = await db.user.getByCILogonUserId(claims.sub);

    if (existingUser) {
      (req.session as any).user = {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email,
      };
      logger.info({ userId: existingUser.id }, "User logged in");
    } else {
      let clusterUsername: string;
      if (isRancherManaged()) {
        const identity = getIdentity(claims);
        try {
          clusterUsername = await getRancherUserID(identity);
          if (!clusterUsername) {
            throw new Error();
          }
        } catch {
          return res.redirect("/error?type=login&code=RANCHER_ID_MISSING");
        }
      }

      const newUser = await db.user.createUserWithPersonalOrg(
        claims.email as string,
        claims.name as string,
        claims.sub,
        clusterUsername,
      );

      req.session.user = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      };
      logger.info(newUser, "User signed up");
    }

    return res.redirect("/dashboard");
  } catch (err) {
    const span = trace.getActiveSpan();
    if (span) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(err as Error);
    }
    return res.redirect("/error?type=login");
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME);
    return res.redirect("https://cilogon.org/logout/?skin=access");
  });
});

export const ALLOWED_ANONYMOUS_ROUTES = [
  "/liveness",
  "/deployment/update",
  "/github/webhook",
  "/logs/ingest",
  "/settings",
  "/templates",
];

export const ALLOWED_ANONYMOUS_OPERATIONS: (keyof operations)[] = [
  // Used to determine whether an endpoint's request type should be Request or AuthenticatedRequest. Should match the array above.
  "livenessProbe",
  "updateDeployment",
  "githubWebhook",
  "ingestLogs",
  "getSettings",
  "getTemplates",
];

router.use((req, res, next) => {
  if (ALLOWED_ANONYMOUS_ROUTES.some((path) => req.url.startsWith(path))) {
    next();
    return;
  }

  const loggedIn = "user" in req.session;
  if (!loggedIn) {
    res.status(401).json({ code: 401, message: "Unauthorized" });
    return;
  }
  (req as AuthenticatedRequest).user = req.session["user"];

  trace.getActiveSpan()?.setAttribute("user.id", req.session["user"].id);

  next();
});

export default router;
