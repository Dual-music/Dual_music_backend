import { Queue, Worker } from 'bullmq';

import { logger } from '../config/logger.js';
import { createQueueConnection } from '../config/redis.js';

import { compileCron } from './cron.js';
import { JOB_DEFINITIONS } from './handlers.js';

/**
 * @file Background-job orchestrator.
 *
 * Two interchangeable runtimes behind one `startJobs()` / `stopJobs()` API:
 *
 *  1. **BullMQ (preferred)** — when Redis is reachable, a single `dual-music`
 *     queue holds repeatable jobs (one per {@link JOB_DEFINITIONS} entry) and a
 *     `Worker` dispatches them by name. Survives restarts, gives retries and a
 *     dashboard-able history.
 *  2. **In-process fallback** — when Redis is absent (dev), a 60-second tick
 *     evaluates each job's cron ({@link compileCron}) against UTC and runs due
 *     handlers, with a per-job re-entrancy guard so a slow job never overlaps
 *     itself.
 *
 * The chosen runtime is transparent to the rest of the app.
 *
 * @module jobs/index
 */

const QUEUE_NAME = 'dual-music';

/** @type {{ queue: Queue|null, worker: Worker|null, timer: NodeJS.Timeout|null, running: Set<string> }} */
const state = { queue: null, worker: null, timer: null, running: new Set() };

/**
 * Runs a single job handler with logging + a re-entrancy guard.
 * @param {{ name: string, handler: () => Promise<unknown> }} def
 * @returns {Promise<void>}
 */
async function runJob(def) {
  if (state.running.has(def.name)) {
    logger.warn({ job: def.name }, 'skipping — previous run still in progress');
    return;
  }
  state.running.add(def.name);
  const startedAt = Date.now();
  try {
    const result = await def.handler();
    logger.info({ job: def.name, ms: Date.now() - startedAt, result }, 'job completed');
  } catch (err) {
    logger.error({ job: def.name, err: err?.message }, 'job failed');
  } finally {
    state.running.delete(def.name);
  }
}

/**
 * Starts the BullMQ runtime: registers repeatable jobs and a dispatching worker.
 * @param {import('ioredis').Redis} connection
 * @returns {Promise<void>}
 */
async function startBullMq(connection) {
  const byName = new Map(JOB_DEFINITIONS.map((d) => [d.name, d]));
  state.queue = new Queue(QUEUE_NAME, { connection });

  // Reconcile repeatable schedule (idempotent: same key + pattern is a no-op).
  for (const def of JOB_DEFINITIONS) {
    await state.queue.add(
      def.name,
      {},
      {
        repeat: { pattern: def.cron, tz: 'UTC' },
        jobId: `repeat:${def.name}`,
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );
  }

  state.worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const def = byName.get(job.name);
      if (!def) return;
      await runJob(def);
    },
    { connection, concurrency: 2 },
  );
  state.worker.on('failed', (job, err) => logger.error({ job: job?.name, err: err?.message }, 'worker job failed'));

  logger.info({ jobs: JOB_DEFINITIONS.map((d) => d.name) }, 'Jobs started (BullMQ + Redis)');
}

/**
 * Starts the in-process fallback scheduler (no Redis).
 * @returns {void}
 */
function startFallback() {
  const compiled = JOB_DEFINITIONS.map((def) => ({ def, due: compileCron(def.cron) }));
  const tick = () => {
    const now = new Date();
    for (const { def, due } of compiled) {
      if (due(now)) void runJob(def);
    }
  };
  // Align to the top of the next minute, then run every 60s.
  const msToNextMinute = (60 - new Date().getUTCSeconds()) * 1000;
  state.timer = setTimeout(() => {
    tick();
    state.timer = setInterval(tick, 60_000);
  }, msToNextMinute);
  logger.info({ jobs: JOB_DEFINITIONS.map((d) => d.name) }, 'Jobs started (in-process cron fallback — Redis absent)');
}

/**
 * Boots the job runtime. Prefers BullMQ; degrades to the in-process scheduler
 * when Redis is unavailable. Safe to call once during server bootstrap.
 * @returns {Promise<void>}
 */
export async function startJobs() {
  const connection = await createQueueConnection();
  if (connection) {
    try {
      await startBullMq(connection);
      return;
    } catch (err) {
      logger.warn({ err: err?.message }, 'BullMQ start failed — falling back to in-process scheduler');
    }
  }
  startFallback();
}

/**
 * Gracefully stops the job runtime (queue/worker or timer). Called on shutdown.
 * @returns {Promise<void>}
 */
export async function stopJobs() {
  if (state.timer) {
    clearTimeout(state.timer);
    clearInterval(state.timer);
    state.timer = null;
  }
  await state.worker?.close().catch(() => {});
  await state.queue?.close().catch(() => {});
  state.worker = null;
  state.queue = null;
}

export default { startJobs, stopJobs };
