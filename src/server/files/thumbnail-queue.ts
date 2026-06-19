import { Queue } from 'bullmq'

import { redisConnectionOptions } from '@/server/deploy/queue'

export type GenerateUploadedFileThumbnailJob = {
  uploadedFileId: string
}

export const uploadedFileThumbnailQueueName = 'uploaded-file-thumbnails'

let uploadedFileThumbnailQueue: Queue<
  GenerateUploadedFileThumbnailJob,
  unknown,
  'generate-uploaded-file-thumbnail'
> | null = null

export function getUploadedFileThumbnailQueue() {
  uploadedFileThumbnailQueue ??= new Queue<
    GenerateUploadedFileThumbnailJob,
    unknown,
    'generate-uploaded-file-thumbnail'
  >(uploadedFileThumbnailQueueName, {
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

  return uploadedFileThumbnailQueue
}

export async function enqueueUploadedFileThumbnail(uploadedFileId: string) {
  await getUploadedFileThumbnailQueue().add(
    'generate-uploaded-file-thumbnail',
    {
      uploadedFileId
    },
    {
      jobId: uploadedFileId
    }
  )
}
