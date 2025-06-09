import express from "express";
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import { type User } from "../generated/prisma/client.ts";
import { PermissionLevel } from "../generated/prisma/enums.ts";
import { db } from "./db.ts";

export const SESSION_COOKIE_NAME = "anvilops_session";

const getRouter = async () => {
  const scope = "openid email profile";

  const server = new URL(
    "https://cilogon.org/.well-known/openid-configuration",
  );
  const callbackURL = process.env.CALLBACK_URL;
  const config = await client.discovery(
    server,
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
  );

  const verify: VerifyFunction = async (tokens, done) => {
    const { sub, email, name } = tokens.claims();
    try {
      const existingUser = await db.user.findUnique({
        where: { ciLogonUserId: sub },
      });
      if (existingUser) {
        done(null, {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
        });
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
        return done(null, {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
        });
      }
    } catch (e) {
      return done(e);
    }
  };

  passport.use(
    new Strategy(
      {
        config,
        scope,
        callbackURL,
      },
      verify,
    ),
  );

  passport.serializeUser((user: User, cb) => {
    process.nextTick(() => {
      return cb(null, {
        id: user.id,
        email: user.email,
        name: user.name,
      });
    });
  });

  passport.deserializeUser((user, cb) => {
    process.nextTick(() => {
      return cb(null, user);
    });
  });

  const router = express.Router();

  router.use(passport.session());

  router.get(
    "/login",
    passport.authenticate(server.host, {
      successRedirect: callbackURL,
      failureRedirect: "/login",
    }),
  );

  router.get(
    "/oauth_callback",
    passport.authenticate(server.host, {
      successReturnToOrRedirect: "/dashboard",
      failureRedirect: "/sign-in",
    }),
  );

  router.post("/logout", passport.authenticate("session"), (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie(SESSION_COOKIE_NAME);
        return res.redirect("https://cilogon.org/logout/?skin=access");
      });
    });
  });

  router.use((req, res, next) => {
    const loggedIn = req.isAuthenticated && req.isAuthenticated();
    if (!loggedIn) {
      res.status(401).json({ message: "Unauthorized", code: 401 });
      return;
    }
    next();
  });

  return router;
};

export default getRouter;
