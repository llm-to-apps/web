import { Worker, type Job } from 'bullmq'

import { redisConnectionOptions } from '../src/server/deploy/queue'
import { envNumber } from '../src/server/env'
import { generateUploadedFileThumbnail } from '../src/server/files/thumbnailer'
import {
  uploadedFileThumbnailQueueName,
  type GenerateUploadedFileThumbnailJob
} from '../src/server/files/thumbnail-queue'
import { logError, logInfo } from '../src/server/logger'

export function startUploadedFileThumbnailWorker() {
  const concurrency = envNumber('UPLOADED_FILE_THUMBNAIL_WORKER_CONCURRENCY', 2)
  const worker = new Worker(
    uploadedFileThumbnailQueueName,
    async (job: Job<GenerateUploadedFileThumbnailJob>) => {
      if (job.name !== 'generate-uploaded-file-thumbnail') {
        throw new Error(`Unknown uploaded file thumbnail job name: ${job.name}`)
      }

      logInfo('uploaded_file.thumbnail_worker.job.started', {
        jobId: job.id,
        uploadedFileId: job.data.uploadedFileId
      })

      return generateUploadedFileThumbnail(job.data.uploadedFileId)
    },
    {
      connection: redisConnectionOptions(),
      concurrency
    }
  )

  worker.on('completed', (job) => {
    logInfo('uploaded_file.thumbnail_worker.job.completed', {
      jobId: job.id,
      uploadedFileId: job.data.uploadedFileId
    })
  })

  worker.on('failed', (job, error) => {
    logError(
      'uploaded_file.thumbnail_worker.job.failed',
      {
        jobId: job?.id,
        uploadedFileId: job?.data.uploadedFileId
      },
      { error }
    )
  })

  logInfo('uploaded_file.thumbnail_worker.started', {
    concurrency,
    queue: uploadedFileThumbnailQueueName
  })

  return worker
}
