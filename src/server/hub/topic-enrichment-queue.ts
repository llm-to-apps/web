import { Queue } from 'bullmq'

import { redisConnectionOptions } from '@/server/deploy/queue'

export type EnrichHubTopicJob = {
  topicId: string
}

export const hubTopicEnrichmentQueueName = 'hub-topic-enrichment'

let hubTopicEnrichmentQueue: Queue<
  EnrichHubTopicJob,
  unknown,
  'enrich-hub-topic'
> | null = null

export function getHubTopicEnrichmentQueue() {
  hubTopicEnrichmentQueue ??= new Queue<EnrichHubTopicJob, unknown, 'enrich-hub-topic'>(
    hubTopicEnrichmentQueueName,
    {
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
    }
  )

  return hubTopicEnrichmentQueue
}

export async function enqueueHubTopicEnrichment(
  topicId: string,
  options: {
    repeat?: boolean
  } = {}
) {
  await getHubTopicEnrichmentQueue().add(
    'enrich-hub-topic',
    {
      topicId
    },
    {
      jobId: options.repeat ? `${topicId}-repeat-${Date.now()}` : topicId
    }
  )
}
