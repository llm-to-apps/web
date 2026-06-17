import http from 'node:http'
import https from 'node:https'
import { Worker, type Job } from 'bullmq'

import {
  deployQueueName,
  getDeployQueue,
  redisConnectionOptions,
  type CheckProjectReadyJob,
  type DeleteProjectJob,
  type DeployProjectJob
} from '../src/server/deploy/queue'
import { prisma } from '../src/server/db'
import { appReadyBaseUrl, envNumber } from '../src/server/env'
import { deleteProjectRepository } from '../src/server/integrations/forgejo'
import { logError, logInfo, logWarn, type LogContext } from '../src/server/logger'
import { startAgentRunWorker } from './agent-run-worker'

type ProjectServiceStatus = {
  ok: true
  ready: boolean
  serviceName: string
  desiredReplicas: number
  runningReplicas: number
  tasks?: Array<{
    id?: string
    desiredState?: string
    state?: string
    message?: string
    error?: string
  }>
}

const serviceReadyTimeoutMs = envNumber('DEPLOY_READY_TIMEOUT_MS', 120_000)
const serviceReadyPollMs = envNumber('DEPLOY_READY_POLL_MS', 2_000)
const appReadyUrl = appReadyBaseUrl()
const appReadyTimeoutMs = envNumber('DEPLOY_APP_READY_TIMEOUT_MS', 900_000)
const appReadyRequestTimeoutMs = envNumber('DEPLOY_APP_READY_REQUEST_TIMEOUT_MS', 2_000)
const appReadyRetryDelayMs = envNumber('DEPLOY_APP_READY_RETRY_DELAY_MS', 2_000)
const appReadyAttempts = envNumber(
  'DEPLOY_APP_READY_ATTEMPTS',
  Math.ceil(appReadyTimeoutMs / appReadyRetryDelayMs) + 5
)
const gracefulShutdownTimeoutMs = envNumber(
  'WORKER_GRACEFUL_SHUTDOWN_TIMEOUT_MS',
  10 * 60_000
)

function jobLogContext(job: Job<{ projectId: string }>): LogContext {
  return {
    attempt: job.attemptsMade + 1,
    jobId: job.id,
    maxAttempts: job.opts.attempts ?? 1,
    operation: job.name,
    projectId: job.data.projectId
  }
}

const worker = new Worker(
  deployQueueName,
  async (job: Job) => {
    if (job.name === 'check-project-ready') {
      return checkProjectReady(job as Job<CheckProjectReadyJob>)
    }

    if (job.name === 'deploy-project') {
      return deployProject(job as Job<DeployProjectJob>)
    }

    if (job.name === 'delete-project') {
      return deleteProject(job as Job<DeleteProjectJob>)
    }

    throw new Error(`Unknown deployment job name: ${job.name}`)
  },
  {
    connection: redisConnectionOptions(),
    concurrency: envNumber('DEPLOY_WORKER_CONCURRENCY', 2)
  }
)
const agentRunWorker = startAgentRunWorker()

worker.on('active', (job) => {
  logInfo('deployment.job.started', jobLogContext(job))
})

worker.on('completed', (job, result) => {
  if (isTimedOutResult(result)) {
    logWarn('deployment.job.readiness_timeout', jobLogContext(job), {
      elapsedMs: result.elapsedMs
    })
    return
  }

  logInfo('deployment.job.completed', jobLogContext(job))
})

worker.on('failed', async (job, error) => {
  if (!job) {
    logError('deployment.job.failed_without_context', {}, { error })
    return
  }

  const attemptsMade = job.attemptsMade
  const maxAttempts = job.opts.attempts ?? 1

  if (attemptsMade < maxAttempts) {
    logInfo('deployment.job.retrying', jobLogContext(job), {
      attempt: attemptsMade,
      maxAttempts,
      reason: error.message
    })
    return
  }

  logError('deployment.job.failed_permanently', jobLogContext(job), { error })

  const failedStatus = job.name === 'delete-project' ? 'delete_failed' : 'failed'

  await prisma.project
    .update({
      where: { id: job.data.projectId },
      data: {
        status: failedStatus,
        deployError: error.message
      }
    })
    .catch((updateError) => {
      logError('deployment.project.mark_failed_failed', jobLogContext(job), {
        error: updateError
      })
    })
})

let isShuttingDown = false

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    logWarn('deployment.worker.shutdown.duplicate_signal', { signal })
    process.exit(1)
  }

  isShuttingDown = true
  logInfo('deployment.worker.shutdown.started', {
    signal,
    timeoutMs: gracefulShutdownTimeoutMs
  })
  await Promise.all([
    closeWorkerGracefully('deploy worker', worker),
    closeWorkerGracefully('agent run worker', agentRunWorker)
  ])
  await prisma.$disconnect()
}

process.on('SIGINT', () => {
  shutdown('SIGINT').finally(() => process.exit(0))
})

process.on('SIGTERM', () => {
  shutdown('SIGTERM').finally(() => process.exit(0))
})

logInfo('deployment.worker.started', { queueName: deployQueueName })

async function closeWorkerGracefully(name: string, workerToClose: Worker) {
  const startedAt = Date.now()
  const closeGracefully = workerToClose.close(false)
  closeGracefully.catch((error) => {
    logError('deployment.worker.close.failed', { workerName: name }, { error })
  })
  const timeout = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), gracefulShutdownTimeoutMs).unref()
  })

  const result = await Promise.race([
    closeGracefully.then(() => 'closed' as const).catch(() => 'failed' as const),
    timeout
  ])

  if (result === 'closed') {
    logInfo('deployment.worker.close.completed', {
      workerName: name,
      elapsedMs: Date.now() - startedAt
    })
    return
  }

  if (result === 'failed') {
    logError('deployment.worker.close.failed', {
      workerName: name,
      elapsedMs: Date.now() - startedAt
    })
    return
  }

  logWarn('deployment.worker.close.timed_out', {
    workerName: name,
    elapsedMs: Date.now() - startedAt,
    timeoutMs: gracefulShutdownTimeoutMs
  })
}

async function deployProject(job: Job<DeployProjectJob>) {
  const { projectId, managerUrl, managerPayload } = job.data
  logInfo('deployment.project.validating', jobLogContext(job), {
    domain: managerPayload.domain,
    serviceName: managerPayload.serviceName,
    image: managerPayload.image
  })

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: { id: true }
  })

  if (!project) {
    logWarn('deployment.project.skipped_inactive', jobLogContext(job))
    return { skipped: true }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'deploying',
      deployError: null
    }
  })
  logInfo('deployment.project.marked_deploying', jobLogContext(job))

  logInfo('deployment.project.manager_request.started', jobLogContext(job), {
    managerUrl,
    serviceName: managerPayload.serviceName,
    image: managerPayload.image,
    domain: managerPayload.domain
  })
  const response = await fetch(`${managerUrl}/swarm/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(managerPayload)
  })
  const result = (await response.json().catch(() => null)) as unknown

  if (!response.ok) {
    throw new Error(
      `Manager deployment request failed with ${response.status}: ${JSON.stringify(result)}`
    )
  }
  logInfo('deployment.project.manager_request.accepted', jobLogContext(job), {
    status: response.status,
    result
  })

  logInfo('deployment.project.service_wait.started', jobLogContext(job), {
    timeoutMs: serviceReadyTimeoutMs,
    pollMs: serviceReadyPollMs
  })
  await waitForProjectServiceReady(managerUrl, projectId)
  logInfo('deployment.project.service_wait.completed', jobLogContext(job))

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'starting',
      deployError: null
    }
  })
  logInfo('deployment.project.marked_starting', jobLogContext(job))

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
  )
  logInfo('deployment.project.readiness_check.enqueued', jobLogContext(job), {
    domain: managerPayload.domain,
    readyJobId: `ready-${projectId}`,
    attempts: appReadyAttempts,
    retryDelayMs: appReadyRetryDelayMs
  })

  return result
}

async function checkProjectReady(job: Job<CheckProjectReadyJob>) {
  const { projectId, domain, readinessStartedAt } = job.data
  logInfo('deployment.project.readiness_probe.started', jobLogContext(job), {
    domain,
    appReadyUrl
  })

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: { id: true }
  })

  if (!project) {
    logWarn('deployment.project.readiness_probe.skipped_inactive', jobLogContext(job))
    return { skipped: true }
  }

  const elapsedMs = Date.now() - readTimestamp(readinessStartedAt, job.timestamp)

  if (elapsedMs > appReadyTimeoutMs) {
    const message = `Project app ${domain} did not become ready within ${appReadyTimeoutMs}ms`

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'failed',
        deployError: message
      }
    })

    logError('deployment.project.readiness_probe.timed_out', jobLogContext(job), {
      domain,
      elapsedMs,
      readinessStartedAt
    })

    return {
      ok: false,
      timedOut: true,
      elapsedMs
    }
  }

  const response = await fetchProjectApp(domain)
  logInfo('deployment.project.readiness_probe.responded', jobLogContext(job), {
    domain,
    status: response.status
  })

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'ready',
      deployError: null,
      managerJobId: String(job.id ?? '')
    }
  })

  logInfo('deployment.project.ready', jobLogContext(job), {
    domain,
    status: response.status
  })

  return {
    ok: true,
    status: response.status
  }
}

async function deleteProject(job: Job<DeleteProjectJob>) {
  const { projectId, managerUrl, resources } = job.data
  logInfo('deployment.project.delete.validating', jobLogContext(job), {
    serviceName: resources.swarm?.serviceName,
    hasMysql: Boolean(resources.mysql),
    hasGit: Boolean(resources.git)
  })

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, deletedAt: true }
  })

  if (!project) {
    logWarn('deployment.project.delete.skipped_missing', jobLogContext(job))
    return { skipped: true }
  }

  if (project.deletedAt) {
    logInfo('deployment.project.delete.skipped_already_deleted', jobLogContext(job))
    return { skipped: true }
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
  }

  logInfo('deployment.project.delete.manager_request.started', jobLogContext(job), {
    managerUrl,
    serviceName: managerPayload.serviceName
  })
  const response = await fetch(
    `${managerUrl}/swarm/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(managerPayload)
    }
  )
  const managerResult = (await response.json().catch(() => null)) as unknown

  if (!response.ok) {
    throw new Error(
      `Manager project deletion failed with ${response.status}: ${JSON.stringify(
        managerResult
      )}`
    )
  }
  logInfo('deployment.project.delete.manager_request.completed', jobLogContext(job), {
    result: managerResult
  })

  logInfo('deployment.project.delete.git_delete.started', jobLogContext(job), {
    owner: resources.git?.owner,
    name: resources.git?.name
  })
  const gitResult = resources.git
    ? await deleteProjectRepository(
        resources.git.owner,
        resources.git.name,
        resources.git.user
      )
    : { deleted: false }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'deleted',
      deletedAt: new Date(),
      deployError: null,
      managerJobId: String(job.id ?? '')
    }
  })
  logInfo('deployment.project.delete.marked_deleted', jobLogContext(job))

  return {
    ok: true,
    manager: managerResult,
    git: gitResult
  }
}

async function waitForProjectServiceReady(managerUrl: string, projectId: string) {
  const startedAt = Date.now()
  let lastStatus: ProjectServiceStatus | null = null
  let pollCount = 0

  while (Date.now() - startedAt < serviceReadyTimeoutMs) {
    pollCount += 1
    const response = await fetch(
      `${managerUrl}/swarm/projects/${encodeURIComponent(projectId)}`
    )
    const status = (await response
      .json()
      .catch(() => null)) as ProjectServiceStatus | null

    if (!response.ok || !status) {
      throw new Error(
        `Manager service status request failed with ${response.status}: ${JSON.stringify(
          status
        )}`
      )
    }

    lastStatus = status
    logInfo('deployment.project.service_wait.poll', {
      projectId,
      poll: pollCount,
      elapsedMs: Date.now() - startedAt,
      ready: status.ready,
      serviceName: status.serviceName,
      replicas: `${status.runningReplicas}/${status.desiredReplicas}`,
      tasks: summarizeServiceTasks(status)
    })

    if (status.ready) {
      return status
    }

    await sleep(serviceReadyPollMs)
  }

  throw new Error(
    `Project service ${projectId} did not become ready within ${serviceReadyTimeoutMs}ms: ${JSON.stringify(
      lastStatus
    )}`
  )
}

async function fetchProjectApp(domain: string) {
  const url = appReadyUrl

  try {
    const response = await requestProjectApp(url, domain)

    if (response.status >= 200 && response.status < 400) {
      return response
    }

    throw new Error(`HTTP ${response.status}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown app readiness error'
    logWarn('deployment.project.readiness_probe.failed', {
      domain,
      appReadyUrl: url,
      message
    })
    throw new Error(`Project app ${domain} is not ready via ${url}: ${message}`)
  }
}

function requestProjectApp(url: string, domain: string) {
  return new Promise<{ status: number }>((resolve, reject) => {
    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'https:' ? https : http
    const path = `${parsedUrl.pathname || '/'}${parsedUrl.search}`
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
        response.resume()

        resolve({
          status: response.statusCode ?? 0
        })
      }
    )

    request.on('timeout', () => {
      request.destroy(new Error(`Request timed out after ${appReadyRequestTimeoutMs}ms`))
    })
    request.on('error', reject)
    request.end()
  })
}

function readTimestamp(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : fallback
}

function isTimedOutResult(
  result: unknown
): result is { timedOut: true; elapsedMs: number } {
  if (!result || typeof result !== 'object') {
    return false
  }

  const record = result as { elapsedMs?: unknown; timedOut?: unknown }
  return record.timedOut === true && typeof record.elapsedMs === 'number'
}

function summarizeServiceTasks(status: ProjectServiceStatus) {
  return (
    status.tasks?.map((task) => ({
      state: task.state,
      desiredState: task.desiredState,
      message: task.message,
      error: task.error
    })) ?? []
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
