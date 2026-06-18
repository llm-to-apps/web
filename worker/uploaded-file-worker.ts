import { Worker, type Job } from 'bullmq'

import {
  uploadedFileQueueName,
  type ProcessUploadedFileJob
} from '../src/server/files/queue'
import { processUploadedFile } from '../src/server/files/processor'
import { redisConnectionOptions } from '../src/server/deploy/queue'
import { envNumber } from '../src/server/env'
import { logError, logInfo } from '../src/server/logger'

export function startUploadedFileWorker() {
  const concurrency = envNumber('UPLOADED_FILE_WORKER_CONCURRENCY', 2)
  const worker = new Worker(
    uploadedFileQueueName,
    async (job: Job<ProcessUploadedFileJob>) => {
      if (job.name !== 'process-uploaded-file') {
        throw new Error(`Unknown uploaded file job name: ${job.name}`)
      }

      logInfo('uploaded_file.worker.job.started', {
        jobId: job.id,
        uploadedFileId: job.data.uploadedFileId
      })

      return processUploadedFile(job.data.uploadedFileId)
    },
    {
      connection: redisConnectionOptions(),
      concurrency
    }
  )

  worker.on('completed', (job) => {
    logInfo('uploaded_file.worker.job.completed', {
      jobId: job.id,
      uploadedFileId: job.data.uploadedFileId
    })
  })

  worker.on('failed', (job, error) => {
    logError(
      'uploaded_file.worker.job.failed',
      {
        jobId: job?.id,
        uploadedFileId: job?.data.uploadedFileId
      },
      { error }
    )
  })

  logInfo('uploaded_file.worker.started', {
    concurrency,
    queue: uploadedFileQueueName
  })

  return worker
}
