import { Worker, type Job } from 'bullmq'

import {
  hubArtifactAnalysisQueueName,
  type AnalyzeHubArtifactJob
} from '../src/server/hub/artifact-analysis-queue'
import { publishHubArtifactChanged } from '../src/server/hub/topic-events'
import { prisma } from '../src/server/db'
import { redisConnectionOptions } from '../src/server/deploy/queue'
import {
  envNumber,
  hubArtifactClassifierModel,
  openRouterApiKey,
  openRouterBaseUrl
} from '../src/server/env'
import { logError, logInfo, logWarn } from '../src/server/logger'

const maxClassifierContentChars = 40_000
const artifactTagSlugs = ['ui', 'logic', 'db', 'data', 'spec'] as const

export function startHubArtifactWorker() {
  const concurrency = envNumber('HUB_ARTIFACT_WORKER_CONCURRENCY', 2)
  const worker = new Worker(
    hubArtifactAnalysisQueueName,
    async (job: Job<AnalyzeHubArtifactJob>) => {
      if (job.name !== 'analyze-hub-artifact') {
        throw new Error(`Unknown hub artifact job name: ${job.name}`)
      }

      logInfo('hub_artifact.worker.job.started', {
        artifactId: job.data.artifactId,
        jobId: job.id
      })

      const artifact = await prisma.hubArtifact.findUnique({
        where: {
          id: job.data.artifactId
        },
        select: {
          id: true,
          textContent: true,
          title: true,
          topicId: true
        }
      })

      if (!artifact) {
        logInfo('hub_artifact.worker.job.skipped_missing', {
          artifactId: job.data.artifactId,
          jobId: job.id
        })
        return
      }

      const content = await readArtifactContent(artifact.id)
      const tagSlugs = content
        ? await classifyArtifactTags({
            content,
            title: artifact.title
          })
        : []
      const tagRecords = await prisma.hubArtifactTag.findMany({
        where: {
          slug: {
            in: tagSlugs
          }
        },
        select: {
          id: true,
          slug: true
        }
      })

      const updated = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.hubArtifact.updateMany({
          where: {
            id: artifact.id
          },
          data: {
            status: 'checked'
          }
        })

        if (updateResult.count === 0) {
          return false
        }

        await tx.hubArtifactTagAssignment.deleteMany({
          where: {
            artifactId: artifact.id
          }
        })

        if (tagRecords.length > 0) {
          await tx.hubArtifactTagAssignment.createMany({
            data: tagRecords.map((tag) => ({
              artifactId: artifact.id,
              tagId: tag.id
            })),
            skipDuplicates: true
          })
        }

        return true
      })

      if (!updated) {
        logInfo('hub_artifact.worker.job.skipped_deleted', {
          artifactId: artifact.id,
          jobId: job.id
        })
        return
      }

      await publishHubArtifactChanged({
        artifactId: artifact.id,
        status: 'checked',
        topicId: artifact.topicId,
        type: 'artifact_changed'
      })
    },
    {
      connection: redisConnectionOptions(),
      concurrency
    }
  )

  worker.on('completed', (job) => {
    logInfo('hub_artifact.worker.job.completed', {
      artifactId: job.data.artifactId,
      jobId: job.id
    })
  })

  worker.on('failed', (job, error) => {
    logError(
      'hub_artifact.worker.job.failed',
      {
        artifactId: job?.data.artifactId,
        jobId: job?.id
      },
      { error }
    )
  })

  logInfo('hub_artifact.worker.started', {
    concurrency,
    queue: hubArtifactAnalysisQueueName
  })

  return worker
}

async function readArtifactContent(artifactId: string) {
  const artifact = await prisma.hubArtifact.findUnique({
    where: {
      id: artifactId
    },
    select: {
      textContent: true,
      uploadedFile: {
        select: {
          extractions: {
            orderBy: {
              createdAt: 'desc'
            },
            select: {
              content: true
            },
            take: 1,
            where: {
              format: 'markdown'
            }
          }
        }
      }
    }
  })

  return (artifact?.textContent ?? artifact?.uploadedFile?.extractions[0]?.content ?? '')
    .trim()
    .slice(0, maxClassifierContentChars)
}

async function classifyArtifactTags({
  content,
  title
}: {
  content: string
  title: string
}) {
  const model = hubArtifactClassifierModel()
  const response = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: [
            'You classify app-development artifacts.',
            `Allowed tags: ${artifactTagSlugs.join(', ')}.`,
            'Return strict JSON only: {"tags":["ui"],"confidence":0.8,"reason":"short reason"}.',
            'Choose 1 to 3 tags.',
            'Use ui for screens, layouts, screenshots, forms, visual UX.',
            'Use logic for workflows, business rules, algorithms, behavior.',
            'Use db for entities, tables, schemas, persistence, relationships.',
            'Use data for examples, reference datasets, catalogs, imports/exports.',
            'Use spec for general requirements, product descriptions, briefs, acceptance criteria.',
            'If unsure, include spec.'
          ].join(' ')
        },
        {
          role: 'user',
          content: `Title: ${title}\n\nContent:\n${content}`
        }
      ],
      response_format: {
        type: 'json_object'
      },
      stream: false
    }),
    headers: {
      Authorization: `Bearer ${openRouterApiKey()}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  if (!response.ok) {
    logWarn('hub_artifact.classifier.request_failed', {
      status: response.status
    })
    return []
  }

  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{
      message?: {
        content?: unknown
      }
    }>
  } | null
  const parsed = parseClassifierJson(body?.choices?.[0]?.message?.content)
  const tags = parsed.tags
    .filter((tag): tag is (typeof artifactTagSlugs)[number] =>
      artifactTagSlugs.includes(tag as (typeof artifactTagSlugs)[number])
    )
    .slice(0, 3)

  return tags
}

function parseClassifierJson(content: unknown): { tags: string[] } {
  if (typeof content !== 'string') {
    return { tags: [] }
  }

  try {
    const parsed = JSON.parse(content) as { tags?: unknown }

    return {
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((tag): tag is string => typeof tag === 'string')
        : []
    }
  } catch {
    return { tags: [] }
  }
}
