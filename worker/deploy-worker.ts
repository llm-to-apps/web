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

async function shutdown() {
  await worker.close();
  await prisma.$disconnect();
}

process.on('SIGINT', () => {
  shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shutdown().finally(() => process.exit(0));
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
