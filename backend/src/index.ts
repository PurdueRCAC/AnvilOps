import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import express from "express";
import session from "express-session";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import apiHandler from "./lib/api.ts";
import getProtectedApiRouter, { SESSION_COOKIE_NAME } from "./lib/auth.ts";

if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
  throw new Error("Credentials not set");
}

if (!process.env.SESSION_SECRET) {
  throw new Error("Session secret not set");
}

const DB_URL =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOSTNAME}/${process.env.POSTGRES_DB}`;
if (!DB_URL) {
  throw new Error("Database credentials not set");
}

const app = express();
app.use(express.json());
const port = 3000;

app.use(cookieParser());

const PgSession = connectPgSimple(session);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: SESSION_COOKIE_NAME,
    cookie: {
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax",
      maxAge: 18 * 60 * 60 * 1000, // 18 hr
      httpOnly: true,
    },
    store: new PgSession({
      conString: DB_URL,
    }),
  })
);

const apiRouter = await getProtectedApiRouter();
apiRouter.use(apiHandler);
app.use("/api", apiRouter);

const publicDir = path.resolve(path.dirname(import.meta.dirname), "public");
if (existsSync(publicDir) && statSync(publicDir).isDirectory()) {
  console.log("Serving static files from", publicDir);
  const index = path.resolve(publicDir, "index.html");

  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      req.accepts("html")
    ) {
      res.sendFile(index, (err) => err && next());
    } else {
      next();
    }
  });
}

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
