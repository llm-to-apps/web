import { Worker } from 'bullmq';

import {
  deployQueueName,
  redisConnectionOptions,
  type DeployProjectJob
} from '../lib/deploy-queue';
import { prisma } from '../lib/db';

type ProjectServiceStatus = {
  ok: true;
  ready: boolean;
  serviceName: string;
  desiredReplicas: number;
  runningReplicas: number;
  tasks?: Array<{
    id?: string;
    desiredState?: string;
    state?: string;
    message?: string;
    error?: string;
  }>;
};

const serviceReadyTimeoutMs = Number(process.env.DEPLOY_READY_TIMEOUT_MS || 120_000);
const serviceReadyPollMs = Number(process.env.DEPLOY_READY_POLL_MS || 2_000);
const appReadyBaseUrl = process.env.APP_READY_BASE_URL || 'http://127.0.0.1';
const appReadyTimeoutMs = Number(process.env.DEPLOY_APP_READY_TIMEOUT_MS || 120_000);
const appReadyPollMs = Number(process.env.DEPLOY_APP_READY_POLL_MS || 2_000);
const appReadyRequestTimeoutMs = Number(
  process.env.DEPLOY_APP_READY_REQUEST_TIMEOUT_MS || 2_000
);

const worker = new Worker<DeployProjectJob, unknown, 'deploy-project'>(
  deployQueueName,
  async (job) => {
    const { projectId, managerUrl, managerPayload } = job.data;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true }
    });

    if (!project) {
      console.warn(`deploy job ${job.id} skipped because project ${projectId} no longer exists`);
      return { skipped: true };
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'deploying',
        deployError: null
      }
    });

    const response = await fetch(`${managerUrl}/swarm/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(managerPayload)
    });
    const result = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      throw new Error(
        `Manager deployment request failed with ${response.status}: ${JSON.stringify(
          result
        )}`
      );
    }

    await waitForProjectServiceReady(managerUrl, projectId);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'starting',
        deployError: null
      }
    });

    await waitForProjectAppReady(managerPayload.domain);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'ready',
        deployError: null,
        managerJobId: String(job.id ?? '')
      }
    });

    return result;
  },
  {
    connection: redisConnectionOptions(),
    concurrency: Number(process.env.DEPLOY_WORKER_CONCURRENCY || 2)
  }
);

worker.on('completed', (job) => {
  console.log(`deploy job ${job.id} completed for project ${job.data.projectId}`);
});

worker.on('failed', async (job, error) => {
  console.error(`deploy job ${job?.id} failed`, error);

  if (!job) {
    return;
  }

  await prisma.project
    .update({
      where: { id: job.data.projectId },
      data: {
        status: 'failed',
        deployError: error.message
      }
    })
    .catch((updateError) => {
      console.error('failed to mark project deployment as failed', updateError);
    });
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    console.warn(`deploy worker received ${signal} while already shutting down; exiting now`);
    process.exit(1);
  }

  isShuttingDown = true;
  console.log(`deploy worker received ${signal}, shutting down`);
  await worker.close(true);
  await prisma.$disconnect();
}

process.on('SIGINT', () => {
  shutdown('SIGINT').finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').finally(() => process.exit(0));
});

console.log(`deploy worker started on queue ${deployQueueName}`);

async function waitForProjectServiceReady(managerUrl: string, projectId: string) {
  const startedAt = Date.now();
  let lastStatus: ProjectServiceStatus | null = null;

  while (Date.now() - startedAt < serviceReadyTimeoutMs) {
    const response = await fetch(
      `${managerUrl}/swarm/projects/${encodeURIComponent(projectId)}`
    );
    const status = (await response.json().catch(() => null)) as ProjectServiceStatus | null;

    if (!response.ok || !status) {
      throw new Error(
        `Manager service status request failed with ${response.status}: ${JSON.stringify(
          status
        )}`
      );
    }

    lastStatus = status;

    if (status.ready) {
      return status;
    }

    await sleep(serviceReadyPollMs);
  }

  throw new Error(
    `Project service ${projectId} did not become ready within ${serviceReadyTimeoutMs}ms: ${JSON.stringify(
      lastStatus
    )}`
  );
}

async function waitForProjectAppReady(domain: string) {
  const startedAt = Date.now();
  let lastError = '';
  let lastStatus: number | null = null;
  const url = appReadyBaseUrl.replace(/\/$/, '') || 'http://127.0.0.1';

  while (Date.now() - startedAt < appReadyTimeoutMs) {
    try {
      const response = await fetch(url, {
        headers: {
          Host: domain
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(appReadyRequestTimeoutMs)
      });

      lastStatus = response.status;

      if (response.status >= 200 && response.status < 400) {
        console.log(
          `project app ${domain} became ready with HTTP ${response.status} after ${Date.now() - startedAt}ms`
        );
        return response;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown app readiness error';
    }

    await sleep(appReadyPollMs);
  }

  throw new Error(
    `Project app ${domain} did not answer with HTTP 2xx/3xx within ${appReadyTimeoutMs}ms via ${url}: ${JSON.stringify(
      {
        lastStatus,
        lastError
      }
    )}`
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
