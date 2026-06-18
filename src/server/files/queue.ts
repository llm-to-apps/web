import { Queue } from 'bullmq'

import { redisConnectionOptions } from '@/server/deploy/queue'

export type ProcessUploadedFileJob = {
  uploadedFileId: string
}

export const uploadedFileQueueName = 'uploaded-file-processing'

let uploadedFileQueue: Queue<
  ProcessUploadedFileJob,
  unknown,
  'process-uploaded-file'
> | null = null

export function getUploadedFileQueue() {
  uploadedFileQueue ??= new Queue<
    ProcessUploadedFileJob,
    unknown,
    'process-uploaded-file'
  >(uploadedFileQueueName, {
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

  return uploadedFileQueue
}
