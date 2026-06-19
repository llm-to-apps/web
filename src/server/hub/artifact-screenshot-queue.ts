import { Queue } from 'bullmq'

import { redisConnectionOptions } from '@/server/deploy/queue'

export type GenerateHubArtifactScreenshotJob = {
  artifactId: string
}

export const hubArtifactScreenshotQueueName = 'hub-artifact-screenshots'

let hubArtifactScreenshotQueue: Queue<
  GenerateHubArtifactScreenshotJob,
  unknown,
  'generate-hub-artifact-screenshot'
> | null = null

export function getHubArtifactScreenshotQueue() {
  hubArtifactScreenshotQueue ??= new Queue<
    GenerateHubArtifactScreenshotJob,
    unknown,
    'generate-hub-artifact-screenshot'
  >(hubArtifactScreenshotQueueName, {
    connection: redisConnectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5_000
      },
      removeOnComplete: {
        age: 60 * 60 * 24,
        count: 1_000
      },
      removeOnFail: {
        age: 60 * 60 * 24 * 7
      }
    }
  })

  return hubArtifactScreenshotQueue
}

export async function enqueueHubArtifactScreenshot(artifactId: string) {
  await getHubArtifactScreenshotQueue().add(
    'generate-hub-artifact-screenshot',
    {
      artifactId
    },
    {
      jobId: artifactId
    }
  )
}
