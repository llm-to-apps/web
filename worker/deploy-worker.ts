import http from 'node:http';
import https from 'node:https';
import { Worker, type Job } from 'bullmq';

import {
  deployQueueName,
  getDeployQueue,
  redisConnectionOptions,
  type CheckProjectReadyJob,
  type DeleteProjectJob,
  type DeployProjectJob
} from '../lib/deploy-queue';
import { prisma } from '../lib/db';
import { appReadyBaseUrl, envNumber } from '../lib/env';
import { deleteProjectRepository } from '../lib/forgejo';
import { startAgentRunWorker } from './agent-run-worker';

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

const serviceReadyTimeoutMs = envNumber('DEPLOY_READY_TIMEOUT_MS', 120_000);
const serviceReadyPollMs = envNumber('DEPLOY_READY_POLL_MS', 2_000);
const appReadyUrl = appReadyBaseUrl();
const appReadyTimeoutMs = envNumber('DEPLOY_APP_READY_TIMEOUT_MS', 900_000);
const appReadyRequestTimeoutMs = envNumber(
  'DEPLOY_APP_READY_REQUEST_TIMEOUT_MS',
  2_000
);
const appReadyRetryDelayMs = envNumber('DEPLOY_APP_READY_RETRY_DELAY_MS', 2_000);
const appReadyAttempts = envNumber(
  'DEPLOY_APP_READY_ATTEMPTS',
  Math.ceil(appReadyTimeoutMs / appReadyRetryDelayMs) + 5
);
const gracefulShutdownTimeoutMs = envNumber(
  'WORKER_GRACEFUL_SHUTDOWN_TIMEOUT_MS',
  10 * 60_000
);

const worker = new Worker(
  deployQueueName,
  async (job: Job) => {
    if (job.name === 'check-project-ready') {
      return checkProjectReady(job as Job<CheckProjectReadyJob>);
    }

    if (job.name === 'deploy-project') {
      return deployProject(job as Job<DeployProjectJob>);
    }

    if (job.name === 'delete-project') {
      return deleteProject(job as Job<DeleteProjectJob>);
    }

    throw new Error(`Unknown deployment job name: ${job.name}`);
  },
  {
    connection: redisConnectionOptions(),
    concurrency: envNumber('DEPLOY_WORKER_CONCURRENCY', 2)
  }
);
const agentRunWorker = startAgentRunWorker();

worker.on('active', (job) => {
  console.log(`${job.name} job ${job.id} started`, {
    projectId: job.data.projectId,
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts ?? 1
  });
});

worker.on('completed', (job, result) => {
  if (isTimedOutResult(result)) {
    console.warn(`${job.name} job ${job.id} stopped after readiness timeout`, {
      projectId: job.data.projectId,
      elapsedMs: result.elapsedMs
    });
    return;
  }

  console.log(`${job.name} job ${job.id} completed for project ${job.data.projectId}`);
});

worker.on('failed', async (job, error) => {
  if (!job) {
    console.error('deployment job failed without job context', error);
    return;
  }

  const attemptsMade = job.attemptsMade;
  const maxAttempts = job.opts.attempts ?? 1;

  if (attemptsMade < maxAttempts) {
    console.info(`${job.name} job ${job.id} will retry`, {
      projectId: job.data.projectId,
      attempt: attemptsMade,
      maxAttempts,
      reason: error.message
    });
    return;
  }

  console.error(`${job.name} job ${job.id} failed permanently`, error);

  const failedStatus = job.name === 'delete-project' ? 'delete_failed' : 'failed';

  await prisma.project
    .update({
      where: { id: job.data.projectId },
      data: {
        status: failedStatus,
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
  console.log(`deploy worker received ${signal}, shutting down gracefully`, {
    timeoutMs: gracefulShutdownTimeoutMs
  });
  await Promise.all([
    closeWorkerGracefully('deploy worker', worker),
    closeWorkerGracefully('agent run worker', agentRunWorker)
  ]);
  await prisma.$disconnect();
}

process.on('SIGINT', () => {
  shutdown('SIGINT').finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').finally(() => process.exit(0));
});

console.log(`deploy worker started on queue ${deployQueueName}`);

async function closeWorkerGracefully(name: string, workerToClose: Worker) {
  const startedAt = Date.now();
  const closeGracefully = workerToClose.close(false);
  closeGracefully.catch((error) => {
    console.error(`${name} graceful shutdown failed`, error);
  });
  const timeout = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), gracefulShutdownTimeoutMs).unref();
  });

  const result = await Promise.race([
    closeGracefully.then(() => 'closed' as const).catch(() => 'failed' as const),
    timeout
  ]);

  if (result === 'closed') {
    console.log(`${name} closed gracefully`, {
      elapsedMs: Date.now() - startedAt
    });
    return;
  }

  if (result === 'failed') {
    console.error(`${name} graceful shutdown failed`, {
      elapsedMs: Date.now() - startedAt
    });
    return;
  }

  console.warn(`${name} graceful shutdown timed out; process will exit`, {
    elapsedMs: Date.now() - startedAt,
    timeoutMs: gracefulShutdownTimeoutMs
  });
}

async function deployProject(job: Job<DeployProjectJob>) {
  const { projectId, managerUrl, managerPayload } = job.data;
  console.log(`deploy-project job ${job.id} validating project`, {
    projectId,
    domain: managerPayload.domain,
    serviceName: managerPayload.serviceName,
    image: managerPayload.image
  });

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: { id: true }
  });

  if (!project) {
    console.warn(
      `deploy job ${job.id} skipped because project ${projectId} is not active`
    );
    return { skipped: true };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'deploying',
      deployError: null
    }
  });
  console.log(`deploy-project job ${job.id} marked project as deploying`, {
    projectId
  });

  console.log(`deploy-project job ${job.id} requesting manager deployment`, {
    projectId,
    managerUrl,
    serviceName: managerPayload.serviceName,
    image: managerPayload.image,
    domain: managerPayload.domain
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
      `Manager deployment request failed with ${response.status}: ${JSON.stringify(result)}`
    );
  }
  console.log(`deploy-project job ${job.id} manager accepted deployment`, {
    projectId,
    status: response.status,
    result
  });

  console.log(`deploy-project job ${job.id} waiting for swarm service readiness`, {
    projectId,
    timeoutMs: serviceReadyTimeoutMs,
    pollMs: serviceReadyPollMs
  });
  await waitForProjectServiceReady(managerUrl, projectId);
  console.log(`deploy-project job ${job.id} swarm service is running`, {
    projectId
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'starting',
      deployError: null
    }
  });
  console.log(`deploy-project job ${job.id} marked project as starting`, {
    projectId
  });

  await getDeployQueue().add(
    'check-project-ready',
    {
      projectId,
      domain: managerPayload.domain,
      readinessStartedAt: new Date().toISOString()
    },
    {
      jobId: `ready-${projectId}`,
      attempts: appReadyAttempts,
      backoff: {
        type: 'fixed',
        delay: appReadyRetryDelayMs
      }
    }
  );
  console.log(`deploy-project job ${job.id} enqueued app readiness check`, {
    projectId,
    domain: managerPayload.domain,
    readyJobId: `ready-${projectId}`,
    attempts: appReadyAttempts,
    retryDelayMs: appReadyRetryDelayMs
  });

  return result;
}

async function checkProjectReady(job: Job<CheckProjectReadyJob>) {
  const { projectId, domain, readinessStartedAt } = job.data;
  console.log(`check-project-ready job ${job.id} probing app`, {
    projectId,
    domain,
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts ?? 1,
    appReadyUrl
  });

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: { id: true }
  });

  if (!project) {
    console.warn(
      `readiness job ${job.id} skipped because project ${projectId} is not active`
    );
    return { skipped: true };
  }

  const elapsedMs = Date.now() - readTimestamp(readinessStartedAt, job.timestamp);

  if (elapsedMs > appReadyTimeoutMs) {
    const message = `Project app ${domain} did not become ready within ${appReadyTimeoutMs}ms`;

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'failed',
        deployError: message
      }
    });

    console.error(`check-project-ready job ${job.id} timed out`, {
      projectId,
      domain,
      elapsedMs,
      readinessStartedAt
    });

    return {
      ok: false,
      timedOut: true,
      elapsedMs
    };
  }

  const response = await fetchProjectApp(domain);
  console.log(`check-project-ready job ${job.id} app responded`, {
    projectId,
    domain,
    status: response.status
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'ready',
      deployError: null,
      managerJobId: String(job.id ?? '')
    }
  });

  console.log(
    `project app ${domain} became ready with HTTP ${response.status} on attempt ${job.attemptsMade + 1}`
  );

  return {
    ok: true,
    status: response.status
  };
}

async function deleteProject(job: Job<DeleteProjectJob>) {
  const { projectId, managerUrl, resources } = job.data;
  console.log(`delete-project job ${job.id} validating project`, {
    projectId,
    serviceName: resources.swarm?.serviceName,
    hasMysql: Boolean(resources.mysql),
    hasGit: Boolean(resources.git)
  });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, deletedAt: true }
  });

  if (!project) {
    console.warn(`delete job ${job.id} skipped because project ${projectId} no longer exists`);
    return { skipped: true };
  }

  if (project.deletedAt) {
    console.info(`delete job ${job.id} skipped because project ${projectId} is already deleted`);
    return { skipped: true };
  }

  const managerPayload = {
    serviceName: resources.swarm?.serviceName,
    services: resources.mysql
      ? {
          mysql: {
            db: resources.mysql.db,
            user: resources.mysql.user
          }
        }
      : undefined
  };

  console.log(`delete-project job ${job.id} requesting manager deletion`, {
    projectId,
    managerUrl,
    serviceName: managerPayload.serviceName
  });
  const response = await fetch(
    `${managerUrl}/swarm/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(managerPayload)
    }
  );
  const managerResult = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      `Manager project deletion failed with ${response.status}: ${JSON.stringify(
        managerResult
      )}`
    );
  }
  console.log(`delete-project job ${job.id} manager deleted project resources`, {
    projectId,
    result: managerResult
  });

  console.log(`delete-project job ${job.id} deleting Forgejo repository/user`, {
    projectId,
    owner: resources.git?.owner,
    name: resources.git?.name
  });
  const gitResult = resources.git
    ? await deleteProjectRepository(
        resources.git.owner,
        resources.git.name,
        resources.git.user
      )
    : { deleted: false };

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'deleted',
      deletedAt: new Date(),
      deployError: null,
      managerJobId: String(job.id ?? '')
    }
  });
  console.log(`delete-project job ${job.id} marked project as deleted`, {
    projectId
  });

  return {
    ok: true,
    manager: managerResult,
    git: gitResult
  };
}

async function waitForProjectServiceReady(managerUrl: string, projectId: string) {
  const startedAt = Date.now();
  let lastStatus: ProjectServiceStatus | null = null;
  let pollCount = 0;

  while (Date.now() - startedAt < serviceReadyTimeoutMs) {
    pollCount += 1;
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
    console.log('swarm service readiness poll', {
      projectId,
      poll: pollCount,
      elapsedMs: Date.now() - startedAt,
      ready: status.ready,
      serviceName: status.serviceName,
      replicas: `${status.runningReplicas}/${status.desiredReplicas}`,
      tasks: summarizeServiceTasks(status)
    });

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

async function fetchProjectApp(domain: string) {
  const url = appReadyUrl;

  try {
    const response = await requestProjectApp(url, domain);

    if (response.status >= 200 && response.status < 400) {
      return response;
    }

    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown app readiness error';
    console.warn('project app readiness probe failed', {
      domain,
      appReadyUrl: url,
      message
    });
    throw new Error(`Project app ${domain} is not ready via ${url}: ${message}`);
  }
}

function requestProjectApp(url: string, domain: string) {
  return new Promise<{ status: number }>((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const path = `${parsedUrl.pathname || '/'}${parsedUrl.search}`;
    const request = client.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        method: 'GET',
        path,
        headers: {
          Host: domain
        },
        timeout: appReadyRequestTimeoutMs
      },
      (response) => {
        response.resume();

        resolve({
          status: response.statusCode ?? 0
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error(`Request timed out after ${appReadyRequestTimeoutMs}ms`));
    });
    request.on('error', reject);
    request.end();
  });
}

function readTimestamp(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function isTimedOutResult(result: unknown): result is { timedOut: true; elapsedMs: number } {
  if (!result || typeof result !== 'object') {
    return false;
  }

  const record = result as { elapsedMs?: unknown; timedOut?: unknown };
  return record.timedOut === true && typeof record.elapsedMs === 'number';
}

function summarizeServiceTasks(status: ProjectServiceStatus) {
  return (
    status.tasks?.map((task) => ({
      state: task.state,
      desiredState: task.desiredState,
      message: task.message,
      error: task.error
    })) ?? []
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
