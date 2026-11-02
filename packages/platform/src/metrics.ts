// Metrics for dashboards and alerts (T-PLT-06; NFR-OBS-001; D section 12; K sections 3 and 5). Served
// on METRICS_PORT, never on the public API port. Labels hold route patterns and queue names only:
// a real path could hold a patient ID, and every new label value costs memory.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDuration = new Histogram({
  name: 'hms_http_request_duration_seconds',
  help: 'API request duration by route pattern',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const jobFailures = new Counter({
  name: 'hms_job_failures_total',
  help: 'Background jobs that failed, by queue (AT-JOB-005)',
  labelNames: ['queue'],
  registers: [metricsRegistry],
});

export const queueDepth = new Gauge({
  name: 'hms_queue_jobs',
  help: 'Jobs in a queue, by state',
  labelNames: ['queue', 'state'],
  registers: [metricsRegistry],
});

export const outboxPublished = new Counter({
  name: 'hms_outbox_published_total',
  help: 'Outbox events sent by the relay',
  registers: [metricsRegistry],
});

export const relayLastSuccess = new Gauge({
  name: 'hms_outbox_relay_last_success_seconds',
  help: 'Unix time of the last successful relay run',
  registers: [metricsRegistry],
});

export interface HealthReport {
  healthy: boolean;
  reason?: string;
}

export interface MetricsServer {
  port: number;
  close(): Promise<void>;
}

async function answer(
  request: IncomingMessage,
  response: ServerResponse,
  health: () => HealthReport,
): Promise<void> {
  if (request.url === '/metrics') {
    response.writeHead(200, { 'Content-Type': metricsRegistry.contentType });
    response.end(await metricsRegistry.metrics());
    return;
  }
  if (request.url === '/health') {
    const report = health();
    response.writeHead(report.healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(report));
    return;
  }
  response.writeHead(404).end();
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Answers /metrics and /health only; Docker and Prometheus read it inside the private network. */
export function startMetricsServer(
  port: number,
  health: () => HealthReport,
): Promise<MetricsServer> {
  const server = createServer((request, response) => void answer(request, response, health));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      const { port: bound } = server.address() as AddressInfo;
      resolve({ port: bound, close: () => closeServer(server) });
    });
  });
}
