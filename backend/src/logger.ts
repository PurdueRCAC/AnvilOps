import pino from "pino";
import pretty from "pino-pretty";

export const logger = process.env.IN_TILT
  ? pino(pretty({ ignore: "req.headers,res.headers", colorize: true })) // In development, pretty-print log lines
  : pino(); // Otherwise, use the default JSON lines format
