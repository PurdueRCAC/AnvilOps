import { SpanStatusCode, trace } from "@opentelemetry/api";
import express from "express";
import type { operations } from "../generated/openapi.ts";
import type { AuthenticatedRequest } from "../handlers/index.ts";
import { logger } from "../logger.ts";
import {
  InvalidIDPError,
  RancherIDNotFoundError,
} from "../service/errors/index.ts";
import { authService } from "../service/index.ts";

export const SESSION_COOKIE_NAME = "anvilops_session";

const router = express.Router();

router.get("/login", async (req, res) => {
  const { code_verifier, nonce, redirect_to } = await authService.handleLogin();
  req.session.code_verifier = code_verifier;

  if (nonce) {
    req.session.nonce = nonce;
  }

  return res.redirect(redirect_to);
});

router.get("/oauth_callback", async (req, res) => {
  try {
    const currentUrl = req.protocol + "://" + req.get("host") + req.originalUrl;
    const user = await authService.handleOAuthCallback(
      currentUrl,
      req.session.code_verifier,
      req.session.nonce,
    );

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    };
    return res.redirect("/dashboard");
  } catch (err) {
    if (err instanceof InvalidIDPError) {
      return res.redirect("/error?type=login&code=IDP_ERROR");
    } else if (err instanceof RancherIDNotFoundError) {
      return res.redirect("/error?type=login&code=RANCHER_ID_MISSING");
    }
    logger.error(err, "Error processing user login");
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
    return res.redirect(authService.getLogoutURL());
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
