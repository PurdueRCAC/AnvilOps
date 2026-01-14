import { SpanStatusCode, trace } from "@opentelemetry/api";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { db } from "./db/index.ts";
import apiHandler, { openApiSpecPath } from "./lib/api.ts";
import apiRouter, { SESSION_COOKIE_NAME } from "./lib/auth.ts";
import { env } from "./lib/env.ts";
import { getSettings } from "./service/getSettings.ts";

const app = express();
const port = process.env.PORT ?? 3000;

export const logger = pino();

app.use((req, res, next) => {
  res.setHeader("x-trace-id", trace.getActiveSpan().spanContext().traceId);
  next();
});

app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.path === "/liveness" },
  }),
);

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
  logger.info({ directory: publicDir }, "Serving static files");
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

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  logger.error({ err }, "Uncaught error while handling request");

  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR });
  }

  res.status(500);

  if (req.accepts(["text/html", "application/json"]) === "application/json") {
    res.send({
      message: "Internal server error",
    });
  } else {
    res.status(500).send(`
<!DOCTYPE html>
<html>
  <head>
    <style type="text/css">
      h1 {
        margin-bottom: 0;
      }
      div {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        text-align: center;
        font-family: sans-serif;
        max-width: 40rem;
        text-wrap: balance;
        margin-inline: auto;
      }
      button {
        cursor: pointer;
        background-color: black;
        color: white;
        border: none;
        border-radius: 0.25rem;
        padding-inline: 0.5rem;
        padding-block: 0.25rem;
      }
    </style>
  </head>
  <body>
    <div>
      <h1>Internal Server Error</h1>
      <p>
        There was a problem processing your request.
        If the issue persists, please contact us with the following trace ID: <code>${span.spanContext().traceId}</code>.
      </p>
      <a href="/">
        <button>Return to AnvilOps Home</button>
      </a>
    </div>
  </body>
</html>`);
  }
};

app.use(errorHandler);

app.listen(port, (err) => {
  if (err !== undefined) {
    logger.error(err, "Error creating server");
  } else {
    getSettings()
      .then((settings) => {
        logger.info({ port, settings: settings }, "Server listening");
      })
      .catch(() => logger.info({ port }, "Server listening"));
  }
});
