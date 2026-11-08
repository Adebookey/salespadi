// Postgres-backed job queue. Webhooks enqueue; the worker (/api/worker) claims and runs jobs with retries.
import "server-only";
import { adminClient } from "./supabase/admin";

export interface EnqueueOptions {
  runAt?: Date;
  /** Jobs with the same dedupe key are only enqueued once (e.g. one AI reply per burst of messages). */
  dedupeKey?: string;
  maxAttempts?: number;
}

export async function enqueue(type: string, payload: Record<string, unknown>, opts: EnqueueOptions = {}) {
  const row = {
    type,
    payload,
    run_at: (opts.runAt ?? new Date()).toISOString(),
    dedupe_key: opts.dedupeKey ?? null,
    max_attempts: opts.maxAttempts ?? 5,
  };
  const { error } = await adminClient().from("jobs").insert(row);
  // 23505 = unique violation on dedupe_key: the job already exists, which is what we want.
  if (error && error.code !== "23505") throw new Error(`enqueue ${type}: ${error.message}`);
}

export type JobHandler = (payload: Record<string, unknown>, job: { id: number; attempts: number }) => Promise<void>;

export async function runJobs(handlers: Record<string, JobHandler>, batch = 10, maxBatches = 5) {
  const db = adminClient();
  let processed = 0;
  for (let i = 0; i < maxBatches; i++) {
    const { data: jobs, error } = await db.rpc("claim_jobs", { batch });
    if (error) throw new Error(`claim_jobs: ${error.message}`);
    if (!jobs?.length) break;
    await Promise.all(
      jobs.map(async (job: { id: number; type: string; payload: Record<string, unknown>; attempts: number }) => {
        const handler = handlers[job.type];
        try {
          if (!handler) throw new Error(`No handler for job type ${job.type}`);
          await handler(job.payload, job);
          await db.rpc("complete_job", { job_id: job.id });
        } catch (e) {
          const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
          console.error(`[job ${job.id} ${job.type}] failed`, msg);
          await db.rpc("fail_job", { job_id: job.id, err: msg });
        }
        processed++;
      }),
    );
  }
  return processed;
}
