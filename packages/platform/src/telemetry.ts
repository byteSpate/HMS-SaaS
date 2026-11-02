// OpenTelemetry traces (T-PLT-06; NFR-OBS-001; D section 12). Off unless OTEL_EXPORTER_OTLP_ENDPOINT
// is set. Spans are made by requestObservabilityMiddleware rather than auto-instrumentation, which
// needs a module loader hook this ES module app does not use. Spans carry the correlation ID, the
// route pattern and the status, never a query string or a body.
import { trace, type Tracer } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

const TRACER_NAME = 'hms';

export interface Telemetry {
  enabled: boolean;
  shutdown(): Promise<void>;
}

export function startTelemetry(serviceName: string, env: NodeJS.ProcessEnv): Telemetry {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return { enabled: false, shutdown: () => Promise.resolve() };
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [],
  });
  sdk.start();
  return {
    enabled: true,
    shutdown: async () => {
      await sdk.shutdown();
      // Lets a later start in the same process register again; only tests do this.
      trace.disable();
    },
  };
}

export function requestTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}
