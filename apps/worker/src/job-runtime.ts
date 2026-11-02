// The worker's running parts (T-PLT-03; ADR-006; NFR-REL-002; D sections 9.4 and 10): the outbox
// relay loop, the fan-out processor and the scheduled maintenance. On shutdown it stops taking jobs
// and waits for the active ones, so a deploy loses nothing (AT-JOB-006).
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@hms/database';
import {
  createValkeyConnection,
  jobFailures,
  OUTBOX_QUEUE,
  outboxPublished,
  publishOutboxBatch,
  queueDepth,
  relayLastSuccess,
  runMaintenance,
  runWithRequestContext,
  type HealthReport,
  type OutboxJob,
} from '@hms/platform';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Redis } from 'ioredis';

const MAINTENANCE_QUEUE = 'maintenance';
const RELAY_INTERVAL_MS = 1_000;
const RELAY_BATCH_SIZE = 100;
const HOURLY_MS = 3_600_000;
// K section 5: the heartbeat counts as lost after 60 seconds.
const HEARTBEAT_LIMIT_MS = 60_000;
const QUEUE_METRICS_INTERVAL_MS = 15_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

@Injectable()
export class JobRuntime implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobRuntime.name);
  private readonly connections: Redis[] = [];
  private readonly workers: Worker[] = [];
  private readonly queues: Queue[] = [];
  private prisma: PrismaClient | undefined;
  private relay: PrismaClient | undefined;
  private relayTimer: NodeJS.Timeout | undefined;
  private queueMetricsTimer: NodeJS.Timeout | undefined;
  private lastRelaySuccess = Date.now();
  private stopping = false;

  private connection(): ConnectionOptions {
    const connection = createValkeyConnection(requireEnv('VALKEY_URL'), 'worker');
    this.connections.push(connection);
    return connection as ConnectionOptions;
  }

  private watch(worker: Worker): Worker {
    // BullMQ needs an error listener, or a lost connection crashes the process.
    worker.on('error', (error) => this.logger.error(`Worker error: ${error.message}`));
    worker.on('failed', (job, error) => {
      jobFailures.inc({ queue: worker.name });
      this.logger.error(`Job ${job?.queueName}/${job?.id} failed: ${error.message}`);
    });
    this.workers.push(worker);
    return worker;
  }

  /** No module consumes events yet; each consumer will register here and use consumeOnce. */
  private async fanOut(job: Job<OutboxJob>): Promise<void> {
    const { correlationId, tenantId, eventType, eventId } = job.data;
    await runWithRequestContext({ correlationId: correlationId ?? eventId, tenantId }, async () => {
      this.logger.debug(`Event ${eventType} ${eventId} has no consumers yet`);
    });
  }

  private startRelay(): void {
    const url = process.env.RELAY_DATABASE_URL;
    if (!url) {
      // Events wait safely in the outbox until the relay role exists (docker/postgres/supabase).
      this.logger.warn('RELAY_DATABASE_URL is not set: events stay in the outbox');
      return;
    }
    this.relay = createPrismaClient(url);
    const queue = new Queue(OUTBOX_QUEUE, { connection: this.connection() });
    this.queues.push(queue);
    const tick = async () => {
      try {
        const relay = this.relay as PrismaClient;
        let sent = 1;
        while (!this.stopping && sent > 0) {
          sent = await publishOutboxBatch(relay, queue, RELAY_BATCH_SIZE);
          outboxPublished.inc(sent);
        }
        this.lastRelaySuccess = Date.now();
        relayLastSuccess.setToCurrentTime();
      } catch (error) {
        // Rows stay unpublished, so the next tick sends them again.
        this.logger.error(`Relay failed: ${(error as Error).message}`);
      }
      if (!this.stopping) this.relayTimer = setTimeout(() => void tick(), RELAY_INTERVAL_MS);
    };
    void tick();
  }

  async onApplicationBootstrap(): Promise<void> {
    this.prisma = createPrismaClient(requireEnv('DATABASE_URL'));
    const prisma = this.prisma;

    this.watch(
      new Worker<OutboxJob>(OUTBOX_QUEUE, (job) => this.fanOut(job), {
        connection: this.connection(),
        concurrency: 4,
      }),
    );

    const maintenance = new Queue(MAINTENANCE_QUEUE, { connection: this.connection() });
    this.queues.push(maintenance);
    // Created idempotently at start: the schedule is code (D section 10).
    await maintenance.upsertJobScheduler(
      'hourly-cleanup',
      { every: HOURLY_MS },
      { name: 'cleanup', opts: { attempts: 3, removeOnComplete: { count: 100 } } },
    );
    this.watch(
      new Worker(
        MAINTENANCE_QUEUE,
        async () => {
          this.logger.log(`Maintenance removed ${JSON.stringify(await runMaintenance(prisma))}`);
        },
        { connection: this.connection(), concurrency: 1 },
      ),
    );

    this.startRelay();
    this.queueMetricsTimer = setInterval(
      () => void this.recordQueueDepth(),
      QUEUE_METRICS_INTERVAL_MS,
    );
    this.logger.log('Worker started');
  }

  /** Unhealthy when the relay is configured and has not succeeded lately (K section 5). */
  health(): HealthReport {
    if (!this.relay || Date.now() - this.lastRelaySuccess < HEARTBEAT_LIMIT_MS) {
      return { healthy: true };
    }
    return { healthy: false, reason: 'The outbox relay has stalled' };
  }

  private async recordQueueDepth(): Promise<void> {
    for (const queue of this.queues) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
        for (const [state, count] of Object.entries(counts)) {
          queueDepth.set({ queue: queue.name, state }, count);
        }
      } catch (error) {
        this.logger.warn(`Queue metrics failed: ${(error as Error).message}`);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.queueMetricsTimer) clearInterval(this.queueMetricsTimer);
    if (this.relayTimer) clearTimeout(this.relayTimer);
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all(this.queues.map((queue) => queue.close()));
    await Promise.all(this.connections.map((connection) => connection.quit()));
    await this.prisma?.$disconnect();
    await this.relay?.$disconnect();
  }
}
