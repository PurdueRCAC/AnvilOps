import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import morgan from "morgan";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { db } from "./db/index.ts";
import apiHandler, { openApiSpecPath } from "./lib/api.ts";
import apiRouter, { SESSION_COOKIE_NAME } from "./lib/auth.ts";
import { env } from "./lib/env.ts";

const app = express();
const port = process.env.PORT ?? 3000;

app.use(cookieParser());

app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: SESSION_COOKIE_NAME,
    cookie: {
      secure: "auto",
      sameSite: "lax",
      maxAge: 18 * 60 * 60 * 1000, // 18 hr
      httpOnly: true,
    },
    store: db.sessionStore,
  }),
);

app.set("trust proxy", ["loopback", "linklocal", "uniquelocal"]);

app.use(
  morgan(
    `:remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms`,
    {
      skip: (req, res) => {
        // Don't log successful /logs/ingest and /liveness requests
        return (
          res.statusCode === 200 &&
          ["/logs/ingest", "/liveness"].includes(req.path)
        );
      },
    },
  ),
);

// For GitHub webhooks, we need to access the request body as a string to verify it against the signature
app.use(
  /^\/api\/github\/webhook/,
  bodyParser.text({
    type: ["application/json"],
    limit: "1000kb",
  }),
);

// Uploading files should have a higher body size limit
app.use(
  /^\/api\/app\/(.*)\/file/,
  bodyParser.raw({ type: "*", limit: "100mb" }),
);

// For everything else, the request body should be valid JSON
app.use(
  /^\/api(?!((\/github\/webhook)|(\/app\/(.*)\/file)))/,
  bodyParser.json(),
);

const updateRateLimiter = rateLimit({
  windowMs: 10000,
  limit: 30,
  standardHeaders: true,
  handler: (req, res) => {
    res.status(429).json({
      code: 429,
      message: "Too many requests, please try again later",
    });
  },
});

apiRouter.post("/app", updateRateLimiter);
apiRouter.post("/app/group", updateRateLimiter);
apiRouter.put("/app/:id", updateRateLimiter);

apiRouter.use(apiHandler);
app.use("/api", apiRouter);

app.use("/openapi.yaml", express.static(openApiSpecPath));
app.use(
  "/ghes-3.16.yaml",
  express.static(path.resolve(openApiSpecPath, "../ghes-3.16.yaml")),
);

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

export const server = app.listen(port, (err) => {
  if (err !== undefined) {
    console.error(err);
  } else {
    console.log(`Listening on port ${port}`);
  }
});
