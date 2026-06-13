import { Worker, type Job } from 'bullmq';

import { agentRunQueueName } from '../lib/agent-run-queue';
import { executeAgentRun } from '../lib/agent-runner';
import { type AgentRunJob } from '../lib/agent-run-types';
import { elapsedSince, errorAgentRun, logAgentRun } from '../lib/agent-run-logger';
import { redisConnectionOptions } from '../lib/deploy-queue';
import { envNumber } from '../lib/env';

export function startAgentRunWorker() {
  const concurrency = envNumber('AGENT_RUN_WORKER_CONCURRENCY', 2);
  const worker = new Worker(
    agentRunQueueName,
    async (job: Job<AgentRunJob>) => {
      const startedAt = Date.now();
      if (job.name !== 'run-agent') {
        throw new Error(`Unknown agent run job name: ${job.name}`);
      }

      logAgentRun('worker.job.started', {
        jobId: job.id,
        runId: job.data.runId
      }, {
        attemptsMade: job.attemptsMade,
        queueWaitMs: Date.now() - job.timestamp
      });
      await executeAgentRun(job.data.runId);
      logAgentRun('worker.job.finished', {
        jobId: job.id,
        runId: job.data.runId
      }, {
        elapsedMs: elapsedSince(startedAt)
      });
    },
    {
      connection: redisConnectionOptions(),
      concurrency
    }
  );

  worker.on('completed', (job) => {
    logAgentRun('worker.job.completed', {
      jobId: job.id,
      runId: job.data.runId
    });
  });

  worker.on('failed', (job, error) => {
    errorAgentRun('worker.job.failed', {
      jobId: job?.id,
      runId: job?.data.runId
    }, {
      message: error.message,
    });
  });

  logAgentRun('worker.started', {}, {
    concurrency,
    queue: agentRunQueueName
  });

  return worker;
}
