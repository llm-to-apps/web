import { Worker } from 'bullmq';

import {
  deployQueueName,
  redisConnectionOptions,
  type DeployProjectJob
} from '../lib/deploy-queue';
import { prisma } from '../lib/db';

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

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'deploying',
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
