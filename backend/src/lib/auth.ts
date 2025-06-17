import express from "express";
import * as client from "openid-client";
import { PermissionLevel } from "../generated/prisma/index.ts";
import { db } from "./db.ts";

export const SESSION_COOKIE_NAME = "anvilops_session";
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const server = new URL("https://cilogon.org/.well-known/openid-configuration");
const redirect_uri = process.env.CALLBACK_URL;

const config = await client.discovery(server, clientID, clientSecret);
const code_challenge_method = "S256";
const scope = "openid email profile org.cilogon.userinfo";
const allowedIdp = "https://idp.purdue.edu/idp/shibboleth";

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
    selected_idp: allowedIdp,
    idp_hint: allowedIdp,
  };

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
      config,
      new URL(currentUrl),
      {
        pkceCodeVerifier: (req.session as any).code_verifier,
        expectedNonce: (req.session as any).nonce,
        idTokenExpected: true,
      },
    );

    const { sub, email, name, idp } = tokens.claims();

    if (idp !== allowedIdp) {
      return res.status(401).redirect("/sign-in");
    }
    const existingUser = await db.user.findUnique({
      where: {
        ciLogonUserId: sub,
      },
    });

    if (existingUser) {
      (req.session as any).user = {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email,
      };
    } else {
      const newUser = await db.user.create({
        data: {
          email: email as string,
          name: name as string,
          ciLogonUserId: sub,
          orgs: {
            create: {
              permissionLevel: PermissionLevel.OWNER,
              organization: {
                create: {
                  name: `${name || (email as string) || sub}'s Apps`,
                },
              },
            },
          },
        },
      });

      (req.session as any).user = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      };
    }

    return res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    return res.status(401).redirect("/sign-in");
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME);
    return res.redirect("https://cilogon.org/logout/?skin=access");
  });
});

const ALLOWED_ROUTES = [
  "/deployment/update",
  "/github/webhook",
  "/logs/ingest",
];
router.use((req, res, next) => {
  if (ALLOWED_ROUTES.some((path) => req.url.startsWith(path))) {
    next();
    return;
  }

  const loggedIn = "user" in req.session;
  if (!loggedIn) {
    res.status(401).json({ code: 401, message: "Unauthorized" });
    return;
  }
  req.user = req.session["user"];
  next();
});

export default router;
