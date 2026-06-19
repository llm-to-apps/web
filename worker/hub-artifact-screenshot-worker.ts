import { Worker, type Job } from 'bullmq'

import { redisConnectionOptions } from '../src/server/deploy/queue'
import { envNumber } from '../src/server/env'
import { generateHubArtifactScreenshot } from '../src/server/hub/artifact-screenshot'
import {
  hubArtifactScreenshotQueueName,
  type GenerateHubArtifactScreenshotJob
} from '../src/server/hub/artifact-screenshot-queue'
import { logError, logInfo } from '../src/server/logger'

export function startHubArtifactScreenshotWorker() {
  const concurrency = envNumber('HUB_ARTIFACT_SCREENSHOT_WORKER_CONCURRENCY', 2)
  const worker = new Worker(
    hubArtifactScreenshotQueueName,
    async (job: Job<GenerateHubArtifactScreenshotJob>) => {
      if (job.name !== 'generate-hub-artifact-screenshot') {
        throw new Error(`Unknown hub artifact screenshot job name: ${job.name}`)
      }

      logInfo('hub_artifact.screenshot_worker.job.started', {
        artifactId: job.data.artifactId,
        jobId: job.id
      })

      return generateHubArtifactScreenshot(job.data.artifactId)
    },
    {
      connection: redisConnectionOptions(),
      concurrency
    }
  )

  worker.on('completed', (job) => {
    logInfo('hub_artifact.screenshot_worker.job.completed', {
      artifactId: job.data.artifactId,
      jobId: job.id
    })
  })

  worker.on('failed', (job, error) => {
    logError(
      'hub_artifact.screenshot_worker.job.failed',
      {
        artifactId: job?.data.artifactId,
        jobId: job?.id
      },
      { error }
    )
  })

  logInfo('hub_artifact.screenshot_worker.started', {
    concurrency,
    queue: hubArtifactScreenshotQueueName
  })

  return worker
}
