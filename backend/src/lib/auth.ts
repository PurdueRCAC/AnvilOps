import { SpanStatusCode, trace } from "@opentelemetry/api";
import express from "express";
import * as client from "openid-client";
import type { operations } from "../generated/openapi.ts";
import type { AuthenticatedRequest } from "../handlers/index.ts";
import { logger } from "../index.ts";
import { oauthCallback } from "../service/oauthCallback.ts";
import { isRancherManaged } from "./cluster/rancher.ts";
import { env } from "./env.ts";

type CallbackErrorCode = "IDP_ERROR" | "RANCHER_ID_MISSING" | null;
export class CallbackError extends Error {
  public readonly code: CallbackErrorCode;
  constructor(code: CallbackErrorCode) {
    super();
    this.code = code;
  }
}

export const SESSION_COOKIE_NAME = "anvilops_session";

export const usingRancherOIDC = () =>
  isRancherManaged() && env.USE_RANCHER_OIDC == "true";
export const usingCILogon = () => !usingRancherOIDC();

const getOIDCConfig = async () => {
  if (usingRancherOIDC()) {
    const server = new URL(
      `${env.RANCHER_BASE_URL}/oidc/.well-known/openid-configuration`,
    );
    return {
      scope: "openid profile",
      oidcConfig: await client.discovery(
        server,
        env.CLIENT_ID,
        env.CLIENT_SECRET,
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
        env.CLIENT_ID,
        env.CLIENT_SECRET,
      ),
    };
  }
};
const { scope, oidcConfig } = await getOIDCConfig();
const redirect_uri = env.BASE_URL + "/api/oauth_callback";
const code_challenge_method = "S256";

const router = express.Router();

router.get("/login", async (req, res) => {
  const code_verifier = client.randomPKCECodeVerifier();
  const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
  req.session.code_verifier = code_verifier;

  const params: Record<string, string> = {
    redirect_uri,
    scope,
    code_challenge,
    code_challenge_method,
    ...(usingCILogon() && {
      selected_idp: env.ALLOWED_IDPS,
      idp_hint: env.ALLOWED_IDPS,
    }),
  };

  if (!oidcConfig.serverMetadata().supportsPKCE()) {
    const nonce = client.randomNonce();
    req.session.nonce = nonce;
    params.nonce = nonce;
  }

  const redirectTo = client.buildAuthorizationUrl(oidcConfig, params);
  return res.redirect(redirectTo.toString());
});

router.get("/oauth_callback", async (req, res) => {
  try {
    const currentUrl = req.protocol + "://" + req.get("host") + req.originalUrl;
    const tokens = await client.authorizationCodeGrant(
      oidcConfig,
      new URL(currentUrl),
      {
        pkceCodeVerifier: req.session.code_verifier,
        expectedNonce: req.session.nonce,
        idTokenExpected: true,
      },
    );

    const claims = tokens.claims();
    req.session.user = await oauthCallback(claims);
    return res.redirect("/dashboard");
  } catch (err) {
    logger.error(err, "Error processing user login");
    const span = trace.getActiveSpan();
    if (span) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(err as Error);
    }
    if (err instanceof CallbackError && err.code) {
      return res.redirect(`/error?type=login&code=${err.code}`);
    }
    return res.redirect("/error?type=login");
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME);
    if (usingCILogon()) {
      return res.redirect("https://cilogon.org/logout/?skin=access");
    }
    return res.redirect(env.BASE_URL);
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
