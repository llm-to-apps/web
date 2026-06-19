import { Queue } from 'bullmq'

import { redisConnectionOptions } from '@/server/deploy/queue'

export type AnalyzeHubArtifactJob = {
  artifactId: string
}

export const hubArtifactAnalysisQueueName = 'hub-artifact-analysis'

let hubArtifactAnalysisQueue: Queue<
  AnalyzeHubArtifactJob,
  unknown,
  'analyze-hub-artifact'
> | null = null

export function getHubArtifactAnalysisQueue() {
  hubArtifactAnalysisQueue ??= new Queue<
    AnalyzeHubArtifactJob,
    unknown,
    'analyze-hub-artifact'
  >(hubArtifactAnalysisQueueName, {
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

  return hubArtifactAnalysisQueue
}

export async function enqueueHubArtifactAnalysis(artifactId: string) {
  await getHubArtifactAnalysisQueue().add(
    'analyze-hub-artifact',
    {
      artifactId
    },
    {
      jobId: artifactId
    }
  )
}
