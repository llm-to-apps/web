import { Worker, type Job } from 'bullmq'

import { redisConnectionOptions } from '../src/server/deploy/queue'
import { prisma } from '../src/server/db'
import {
  envNumber,
  hubTopicEnrichmentModel,
  openRouterApiKey,
  openRouterBaseUrl
} from '../src/server/env'
import {
  hubTopicEnrichmentQueueName,
  type EnrichHubTopicJob
} from '../src/server/hub/topic-enrichment-queue'
import { publishHubTopicChanged } from '../src/server/hub/topic-events'
import { logError, logInfo, logWarn } from '../src/server/logger'

const topicLocales = ['en', 'ru', 'de'] as const
const enrichedHubTopicStatus = 'discussing'

type TopicLocale = (typeof topicLocales)[number]

type TopicEnrichment = {
  description: Record<TopicLocale, string>
  intent: Record<TopicLocale, string>
  tags: string[]
  title: Record<TopicLocale, string>
}

type RawTopicEnrichment = Omit<TopicEnrichment, 'intent'> & {
  intent: Record<TopicLocale, string[]>
}

type TopicTagOption = {
  slug: string
  title: string
}

export function startHubTopicWorker() {
  const concurrency = envNumber('HUB_TOPIC_WORKER_CONCURRENCY', 2)
  const worker = new Worker(
    hubTopicEnrichmentQueueName,
    async (job: Job<EnrichHubTopicJob>) => {
      if (job.name !== 'enrich-hub-topic') {
        throw new Error(`Unknown hub topic job name: ${job.name}`)
      }

      logInfo('hub_topic.worker.job.started', {
        jobId: job.id,
        topicId: job.data.topicId
      })

      return enrichHubTopic(job.data.topicId)
    },
    {
      connection: redisConnectionOptions(),
      concurrency
    }
  )

  worker.on('completed', (job) => {
    logInfo('hub_topic.worker.job.completed', {
      jobId: job.id,
      topicId: job.data.topicId
    })
  })

  worker.on('failed', (job, error) => {
    logError(
      'hub_topic.worker.job.failed',
      {
        jobId: job?.id,
        topicId: job?.data.topicId
      },
      { error }
    )

    const attempts = typeof job?.opts.attempts === 'number' ? job.opts.attempts : 1

    if (job && job.attemptsMade >= attempts) {
      void releaseHubTopicAfterFailedEnrichment(job.data.topicId, error)
    }
  })

  logInfo('hub_topic.worker.started', {
    concurrency,
    queue: hubTopicEnrichmentQueueName
  })

  return worker
}

async function enrichHubTopic(topicId: string) {
  const topic = await prisma.hubTopic.findUnique({
    where: {
      id: topicId
    },
    select: {
      category: true,
      id: true,
      intent: true,
      title: true
    }
  })

  if (!topic) {
    logWarn('hub_topic.enrichment.skipped_missing', { topicId })
    return { skipped: true }
  }

  const tagRecords = await prisma.hubTag.findMany({
    orderBy: {
      sortOrder: 'asc'
    },
    select: {
      id: true,
      slug: true,
      translations: {
        where: {
          locale: 'en'
        },
        select: {
          title: true
        },
        take: 1
      }
    },
    where: {
      category: topic.category
    }
  })
  const tagOptions = tagRecords.map((tag) => ({
    slug: tag.slug,
    title: tag.translations[0]?.title ?? tag.slug
  }))
  const enrichment = await requestTopicEnrichment(topic.intent, tagOptions)
  const title = cleanText(enrichment.title.en).slice(0, 160)
  const description = cleanText(enrichment.description.en)
  const selectedTags = selectValidTopicTags(enrichment.tags, tagRecords)

  const updated = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.hubTopic.updateMany({
      where: {
        id: topic.id
      },
      data: {
        description,
        status: enrichedHubTopicStatus,
        title: title || topic.title
      }
    })

    if (updateResult.count === 0) {
      return false
    }

    for (const locale of topicLocales) {
      await tx.hubTopicTranslation.upsert({
        where: {
          topicId_locale: {
            locale,
            topicId: topic.id
          }
        },
        update: {
          description: cleanText(enrichment.description[locale]),
          intent: cleanMultilineText(enrichment.intent[locale]),
          title: cleanText(enrichment.title[locale]).slice(0, 160)
        },
        create: {
          description: cleanText(enrichment.description[locale]),
          intent: cleanMultilineText(enrichment.intent[locale]),
          locale,
          title: cleanText(enrichment.title[locale]).slice(0, 160),
          topicId: topic.id
        }
      })
    }

    await tx.hubTopicTag.deleteMany({
      where: {
        topicId: topic.id
      }
    })

    if (selectedTags.length > 0) {
      await tx.hubTopicTag.createMany({
        data: selectedTags.map((tag) => ({
          tagId: tag.id,
          topicId: topic.id
        }))
      })
    }

    return true
  })

  if (!updated) {
    logInfo('hub_topic.enrichment.skipped_deleted', { topicId: topic.id })
    return { skipped: true }
  }

  await publishHubTopicChanged({
    status: enrichedHubTopicStatus,
    topicId: topic.id,
    type: 'topic_changed'
  })

  return {
    status: enrichedHubTopicStatus,
    topicId: topic.id
  }
}

async function releaseHubTopicAfterFailedEnrichment(topicId: string, error: Error) {
  const result = await prisma.hubTopic.updateMany({
    where: {
      id: topicId,
      status: 'analyzing'
    },
    data: {
      status: enrichedHubTopicStatus
    }
  })

  if (result.count === 0) {
    return
  }

  logWarn(
    'hub_topic.enrichment.released_after_failure',
    {
      topicId
    },
    {
      error
    }
  )

  await publishHubTopicChanged({
    status: enrichedHubTopicStatus,
    topicId,
    type: 'topic_changed'
  })
}

async function requestTopicEnrichment(intent: string, tagOptions: TopicTagOption[]) {
  const intentSegments = splitIntentSegments(intent)
  const response = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
    body: JSON.stringify({
      model: hubTopicEnrichmentModel(),
      messages: [
        {
          role: 'system',
          content: [
            'You enrich app-development requests for a public product forum.',
            'Return strict JSON only.',
            'Translate the original intent into English, Russian, and German segment by segment.',
            'Do not summarize, shorten, merge, omit, or add intent details.',
            `Each translated intent locale must be an array with exactly ${intentSegments.length} string item(s), one translated item per source segment, in the same order.`,
            'Do not include numbering or bullets in translated intents.',
            'Create a short practical title and a concise description in English, Russian, and German.',
            'Do not invent product details that are not implied by the intent.',
            'Select 0 to 3 topic tag slugs from the allowed tag list.',
            'Do not return tags that are not present in the allowed tag list.',
            'Title must be 3 to 7 words. Description must be 1 to 2 sentences.',
            'JSON shape: {"intent":{"en":[],"ru":[],"de":[]},"title":{"en":"","ru":"","de":""},"description":{"en":"","ru":"","de":""},"tags":[]}.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            'Intent segments:',
            intentSegments.map((segment, index) => `${index + 1}. ${segment}`).join('\n'),
            '',
            'Allowed topic tags:',
            tagOptions.length > 0
              ? tagOptions.map((tag) => `- ${tag.slug}: ${tag.title}`).join('\n')
              : '- none'
          ].join('\n')
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

  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{
      message?: {
        content?: unknown
      }
    }>
    error?: {
      message?: string
    }
  } | null

  if (!response.ok) {
    throw new Error(
      body?.error?.message ??
        `OpenRouter topic enrichment failed with status ${response.status}`
    )
  }

  return parseTopicEnrichment(body?.choices?.[0]?.message?.content, {
    intent,
    segmentCount: intentSegments.length
  })
}

function parseTopicEnrichment(
  content: unknown,
  expected: {
    intent: string
    segmentCount: number
  }
): TopicEnrichment {
  if (typeof content !== 'string') {
    throw new Error('Topic enrichment response is empty')
  }

  const parsed = JSON.parse(content) as Partial<RawTopicEnrichment>

  if (!Array.isArray(parsed.tags)) {
    throw new Error('Topic enrichment response is missing tags')
  }

  const translatedIntent: Record<TopicLocale, string[]> = {
    de: [],
    en: [],
    ru: []
  }

  for (const locale of topicLocales) {
    if (
      typeof parsed.title?.[locale] !== 'string' ||
      !Array.isArray(parsed.intent?.[locale]) ||
      typeof parsed.description?.[locale] !== 'string'
    ) {
      throw new Error(`Topic enrichment response is missing ${locale}`)
    }

    if (!parsed.intent[locale].every((segment) => typeof segment === 'string')) {
      throw new Error(`Topic enrichment response has invalid ${locale} intent`)
    }

    translatedIntent[locale] = parsed.intent[locale]
    validateTranslatedIntent(translatedIntent[locale], expected, locale)
  }

  return {
    description: parsed.description as Record<TopicLocale, string>,
    intent: {
      de: joinIntentSegments(translatedIntent.de),
      en: joinIntentSegments(translatedIntent.en),
      ru: joinIntentSegments(translatedIntent.ru)
    },
    tags: parsed.tags,
    title: parsed.title as Record<TopicLocale, string>
  }
}

function selectValidTopicTags(
  slugs: string[],
  tagRecords: Array<{
    id: string
    slug: string
  }>
) {
  const tagsBySlug = new Map(tagRecords.map((tag) => [tag.slug, tag]))
  const selectedTags = []
  const seenSlugs = new Set<string>()

  for (const slug of slugs) {
    if (typeof slug !== 'string' || seenSlugs.has(slug)) {
      continue
    }

    const tag = tagsBySlug.get(slug)

    if (!tag) {
      continue
    }

    selectedTags.push(tag)
    seenSlugs.add(slug)

    if (selectedTags.length >= 3) {
      break
    }
  }

  return selectedTags
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function cleanMultilineText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitIntentSegments(intent: string) {
  return cleanMultilineText(intent)
    .split('\n')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function validateTranslatedIntent(
  translatedSegments: string[],
  expected: {
    intent: string
    segmentCount: number
  },
  locale: TopicLocale
) {
  if (translatedSegments.length !== expected.segmentCount) {
    throw new Error(
      `Topic enrichment response shortened ${locale} intent: expected ${expected.segmentCount} segment(s), got ${translatedSegments.length}`
    )
  }

  const translatedIntent = joinIntentSegments(translatedSegments)

  if (
    expected.intent.length >= 120 &&
    translatedIntent.trim().length < expected.intent.length * 0.4
  ) {
    throw new Error(`Topic enrichment response shortened ${locale} intent`)
  }
}

function joinIntentSegments(segments: string[]) {
  return segments.map((segment) => segment.trim()).join('\n')
}
