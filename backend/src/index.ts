import bodyParser from "body-parser";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import session from "express-session";
import morgan from "morgan";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import apiHandler, { openApiSpecPath } from "./lib/api.ts";
import apiRouter, { SESSION_COOKIE_NAME } from "./lib/auth.ts";
import { DATABASE_URL } from "./lib/db.ts";

if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
  throw new Error("Credentials not set");
}

if (!process.env.SESSION_SECRET) {
  throw new Error("Session secret not set");
}

if (!DATABASE_URL) {
  throw new Error("Database credentials not set");
}

const app = express();
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
      conString: DATABASE_URL,
    }),
  }),
);

app.set("trust proxy", ["loopback", "linklocal", "uniquelocal"]);

app.use(
  morgan(
    `:remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms`,
  ),
);

// For GitHub webhooks, we need to access the request body as a string to verify it against the signature
// For log ingestion, the request body is a series of JSON objects separated by newlines
app.use(
  /^\/api((\/github\/webhook)|(\/logs\/ingest))/,
  bodyParser.text({
    type: ["application/json", "application/jsonl"],
    limit: "1000kb",
  }),
);

// For everything else, the request body should be valid JSON
app.use(/^\/api(?!((\/github\/webhook)|(\/logs\/ingest)))/, bodyParser.json());

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

app.use(cors());

app.use("/openapi.yaml", express.static(openApiSpecPath));
app.use(
  "/ghes-3.16.yaml",
  express.static(path.resolve(openApiSpecPath, "../ghes-3.16.yaml")),
);

app.listen(port, (err) => {
  if (err !== undefined) {
    console.error(err);
  } else {
    console.log(`Listening on port ${port}`);
  }
});
