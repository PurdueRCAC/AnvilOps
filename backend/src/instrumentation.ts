import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("@opentelemetry/instrumentation/hook.mjs", pathToFileURL("./"));

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { containerDetector } from "@opentelemetry/resource-detector-container";
import {
  detectResources,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { PrismaInstrumentation } from "@prisma/instrumentation";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME ?? "anvilops";

if (endpoint) {
  console.log("Starting instrumentation");
  const sdk = new NodeSDK({
    serviceName: serviceName,
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    }).merge(
      detectResources({
        detectors: [containerDetector],
      }),
    ),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: process.env.IN_TILT ? 10_000 : 5 * 60_000,
    }),
    logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
    instrumentations: [
      new PrismaInstrumentation(),
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-http": {
          requestHook: (span, request) => {
            // Used in src/lib/api.ts to override spans' names when openapi-backend handles routing for a request
            request["_otel_root_span"] = span;
          },
        },
      }),
    ],
  });

  // diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

  sdk.start();

  process.on("SIGTERM", () => {
    console.log("Shutting down");
    sdk
      .shutdown()
      .then(() => console.log("Instrumentation shut down"))
      .catch((err) =>
        console.error("Instrumentation failed to shut down:", err),
      )
      .finally(() => process.exit(0));
  });
} else {
  console.log("Running without instrumentation");
}
