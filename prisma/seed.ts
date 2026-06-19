import { PrismaClient, type Prisma } from '@prisma/client'
import * as nextEnv from '@next/env'
import fs from 'node:fs'
import path from 'node:path'

const { loadEnvConfig } = (
  'default' in nextEnv ? nextEnv.default : nextEnv
) as typeof nextEnv
loadEnvConfig(process.cwd())

type AppTemplateSeed = {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  status: 'available' | 'coming_soon'
  repository?: string
  git?: string
  image?: string
  appPort?: number
  agentPort?: number
  sortOrder: number
  manifestUrl?: string
  manifest?: Prisma.InputJsonValue
}

type UsagePriceSeed = {
  id: string
  meterType: string
  provider?: string | null
  model?: string | null
  unit: string
  inputCredits?: string | null
  outputCredits?: string | null
  unitCredits?: string | null
  inputCostUsd?: string | null
  outputCostUsd?: string | null
  unitCostUsd?: string | null
  effectiveFrom: Date
  effectiveTo?: Date | null
  metadata?: Prisma.InputJsonValue | null
}

type HubTagSeed = {
  category: 'business' | 'personal'
  translations: {
    de: string
    en: string
    ru: string
  }
  slug: string
  sortOrder: number
}

type HubArtifactTagSeed = {
  translations: {
    de: string
    en: string
    ru: string
  }
  slug: string
  sortOrder: number
}

const prisma = new PrismaClient()
const moneyTemplateManifestCommit = 'f67b4176d813dc0abe8854be70b700fe83247f9e'
const moneyTemplateImage = 'ghcr.io/llm-to-apps/money-template:sha-f67b417'
const moneyTemplateManifestBaseUrl = `https://cdn.jsdelivr.net/gh/llm-to-apps/money-template@${moneyTemplateManifestCommit}`

const staticAppTemplates: AppTemplateSeed[] = [
  {
    id: 'kanban',
    slug: 'kanban',
    name: 'Kanban',
    description: 'Visual task board for projects, cards, priorities, and workflows.',
    icon: 'kanban',
    status: 'coming_soon',
    sortOrder: 20
  },
  {
    id: 'personalCrm',
    slug: 'personal-crm',
    name: 'Personal CRM',
    description:
      'Lightweight contact manager with notes, follow-ups, and relationship history.',
    icon: 'crm',
    status: 'coming_soon',
    sortOrder: 30
  },
  {
    id: 'habitTracker',
    slug: 'habit-tracker',
    name: 'Habit Tracker',
    description: 'Daily habit tracking with streaks, goals, and progress insights.',
    icon: 'habits',
    status: 'coming_soon',
    sortOrder: 40
  },
  {
    id: 'pomodoro',
    slug: 'pomodoro',
    name: 'Pomodoro',
    description: 'Focus timer with sessions, breaks, tasks, and productivity stats.',
    icon: 'pomodoro',
    status: 'coming_soon',
    sortOrder: 50
  },
  {
    id: 'notes',
    slug: 'notes',
    name: 'Notes',
    description: 'Personal knowledge base with tags, search, and linked notes.',
    icon: 'notes',
    status: 'coming_soon',
    sortOrder: 60
  },
  {
    id: 'mealPlanner',
    slug: 'meal-planner',
    name: 'Meal Planner',
    description: 'Weekly meals, recipes, ingredients, and grocery planning.',
    icon: 'meal',
    status: 'coming_soon',
    sortOrder: 70
  },
  {
    id: 'workoutTracker',
    slug: 'workout-tracker',
    name: 'Workout Tracker',
    description: 'Exercise plans, sets, progress history, and personal records.',
    icon: 'workout',
    status: 'coming_soon',
    sortOrder: 80
  },
  {
    id: 'subscriptionTracker',
    slug: 'subscription-tracker',
    name: 'Subscription Tracker',
    description: 'Track recurring payments, renewal dates, and monthly spending.',
    icon: 'subscriptions',
    status: 'coming_soon',
    sortOrder: 90
  },
  {
    id: 'jobSearchCrm',
    slug: 'job-search-crm',
    name: 'Job Search CRM',
    description: 'Manage vacancies, companies, interviews, offers, and follow-ups.',
    icon: 'jobs',
    status: 'coming_soon',
    sortOrder: 100
  },
  {
    id: 'moodJournal',
    slug: 'mood-journal',
    name: 'Mood Journal',
    description: 'Track mood, notes, triggers, habits, and emotional patterns.',
    icon: 'mood',
    status: 'coming_soon',
    sortOrder: 110
  },
  {
    id: 'bookingCalendar',
    slug: 'booking-calendar',
    name: 'Booking Calendar',
    description:
      'Calendly-style scheduling app where people can book available time slots.',
    icon: 'booking',
    status: 'coming_soon',
    sortOrder: 120
  }
]

const usagePrices: UsagePriceSeed[] = [
  {
    id: 'price_openai_gpt_5_mini_llm_v1',
    meterType: 'llm_tokens',
    provider: 'openai',
    model: 'openai/gpt-5-mini',
    unit: 'million_tokens',
    inputCredits: '2500',
    outputCredits: '20000',
    inputCostUsd: '0.25000000',
    outputCostUsd: '2.00000000',
    effectiveFrom: new Date('2026-06-12T00:00:00.000Z'),
    metadata: {
      note: 'MVP price in credits; cost baseline mirrors docs/billing-pricing.md.'
    }
  },
  {
    id: 'price_openai_gpt_5_llm_v1',
    meterType: 'llm_tokens',
    provider: 'openai',
    model: 'openai/gpt-5',
    unit: 'million_tokens',
    inputCredits: '12500',
    outputCredits: '100000',
    inputCostUsd: '1.25000000',
    outputCostUsd: '10.00000000',
    effectiveFrom: new Date('2026-06-12T00:00:00.000Z'),
    metadata: {
      note: 'MVP price in credits; cost baseline mirrors docs/billing-pricing.md.'
    }
  },
  {
    id: 'price_internal_s2s_email_send_v1',
    meterType: 's2s_email_send',
    provider: 'internal',
    model: null,
    unit: 'request',
    unitCredits: '100',
    unitCostUsd: '0.00100000',
    effectiveFrom: new Date('2026-06-12T00:00:00.000Z'),
    metadata: {
      note: 'Placeholder MVP S2S email price. Charged after successful send when email API is implemented.'
    }
  }
]

const hubTags: HubTagSeed[] = [
  {
    category: 'business',
    translations: {
      de: 'Finanzen',
      en: 'Finances',
      ru: 'Финансы'
    },
    slug: 'finances',
    sortOrder: 10
  },
  {
    category: 'business',
    translations: {
      de: 'Vertrieb',
      en: 'Sales',
      ru: 'Продажи'
    },
    slug: 'sales',
    sortOrder: 20
  },
  {
    category: 'business',
    translations: {
      de: 'Projektmanagement',
      en: 'Project management',
      ru: 'Управление проектами'
    },
    slug: 'project-management',
    sortOrder: 30
  },
  {
    category: 'personal',
    translations: {
      de: 'Gewohnheiten',
      en: 'Habits',
      ru: 'Привычки'
    },
    slug: 'habits',
    sortOrder: 10
  },
  {
    category: 'personal',
    translations: {
      de: 'Produktivität',
      en: 'Productivity',
      ru: 'Продуктивность'
    },
    slug: 'productivity',
    sortOrder: 20
  },
  {
    category: 'personal',
    translations: {
      de: 'Gesundheit',
      en: 'Health',
      ru: 'Здоровье'
    },
    slug: 'health',
    sortOrder: 30
  }
]

const hubArtifactTags: HubArtifactTagSeed[] = [
  {
    translations: {
      de: 'UI',
      en: 'UI',
      ru: 'UI'
    },
    slug: 'ui',
    sortOrder: 10
  },
  {
    translations: {
      de: 'Logik',
      en: 'Logic',
      ru: 'Логика'
    },
    slug: 'logic',
    sortOrder: 20
  },
  {
    translations: {
      de: 'Datenbank',
      en: 'Database',
      ru: 'База данных'
    },
    slug: 'db',
    sortOrder: 30
  },
  {
    translations: {
      de: 'Daten',
      en: 'Data',
      ru: 'Данные'
    },
    slug: 'data',
    sortOrder: 40
  },
  {
    translations: {
      de: 'Spezifikation',
      en: 'Spec',
      ru: 'Спецификация'
    },
    slug: 'spec',
    sortOrder: 50
  }
]

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

async function main() {
  await seedAppTemplates()
  await seedUsagePrices()
  await seedHubTags()
  await seedHubArtifactTags()
  await backfillHubTopicTags()
}

async function seedAppTemplates() {
  const includeDevTemplates = process.env.NODE_ENV !== 'production'
  const moneyTemplates = includeDevTemplates
    ? [
        templateFromLocalManifest('../templates/money/manifest.json', {
          image: 'os7-money-template:local',
          manifestUrl: 'local:../templates/money/manifest.json'
        }),
        templateFromLocalManifest('../templates/money/manifest.dev.json', {
          image: 'os7-money:dev',
          manifestUrl: 'local:../templates/money/manifest.dev.json'
        })
      ]
    : [
        await templateFromManifestUrl(`${moneyTemplateManifestBaseUrl}/manifest.json`, {
          image: moneyTemplateImage
        })
      ]
  const appTemplates = [...moneyTemplates, ...staticAppTemplates]

  if (!includeDevTemplates) {
    await prisma.appTemplate.deleteMany({
      where: {
        id: 'money-dev'
      }
    })
  }

  for (const template of appTemplates) {
    await prisma.appTemplate.upsert({
      where: {
        id: template.id
      },
      update: {
        agentPort: template.agentPort ?? null,
        appPort: template.appPort ?? null,
        description: template.description,
        git: template.git ?? null,
        icon: template.icon,
        image: template.image ?? null,
        manifest: template.manifest ?? undefined,
        manifestUrl: template.manifestUrl ?? null,
        name: template.name,
        repository: template.repository ?? null,
        slug: template.slug,
        sortOrder: template.sortOrder,
        status: template.status
      },
      create: {
        agentPort: template.agentPort ?? null,
        appPort: template.appPort ?? null,
        description: template.description,
        git: template.git ?? null,
        icon: template.icon,
        id: template.id,
        image: template.image ?? null,
        manifest: template.manifest ?? undefined,
        manifestUrl: template.manifestUrl ?? null,
        name: template.name,
        repository: template.repository ?? null,
        slug: template.slug,
        sortOrder: template.sortOrder,
        status: template.status
      }
    })
  }
}

async function seedUsagePrices() {
  for (const price of usagePrices) {
    await prisma.usagePrice.upsert({
      where: {
        id: price.id
      },
      update: {
        effectiveFrom: price.effectiveFrom,
        effectiveTo: price.effectiveTo ?? null,
        inputCostUsd: price.inputCostUsd ?? null,
        inputCredits: price.inputCredits ?? null,
        metadata: price.metadata ?? undefined,
        meterType: price.meterType,
        model: price.model ?? null,
        outputCostUsd: price.outputCostUsd ?? null,
        outputCredits: price.outputCredits ?? null,
        provider: price.provider ?? null,
        unit: price.unit,
        unitCostUsd: price.unitCostUsd ?? null,
        unitCredits: price.unitCredits ?? null
      },
      create: {
        effectiveFrom: price.effectiveFrom,
        effectiveTo: price.effectiveTo ?? null,
        id: price.id,
        inputCostUsd: price.inputCostUsd ?? null,
        inputCredits: price.inputCredits ?? null,
        metadata: price.metadata ?? undefined,
        meterType: price.meterType,
        model: price.model ?? null,
        outputCostUsd: price.outputCostUsd ?? null,
        outputCredits: price.outputCredits ?? null,
        provider: price.provider ?? null,
        unit: price.unit,
        unitCostUsd: price.unitCostUsd ?? null,
        unitCredits: price.unitCredits ?? null
      }
    })
  }
}

async function seedHubTags() {
  for (const tag of hubTags) {
    const tagRecord = await prisma.hubTag.upsert({
      where: {
        category_slug: {
          category: tag.category,
          slug: tag.slug
        }
      },
      update: {
        sortOrder: tag.sortOrder
      },
      create: {
        category: tag.category,
        slug: tag.slug,
        sortOrder: tag.sortOrder
      }
    })

    for (const [locale, title] of Object.entries(tag.translations)) {
      await prisma.hubTagTranslation.upsert({
        where: {
          tagId_locale: {
            locale,
            tagId: tagRecord.id
          }
        },
        update: {
          title
        },
        create: {
          locale,
          tagId: tagRecord.id,
          title
        }
      })
    }
  }
}

async function seedHubArtifactTags() {
  const activeSlugs = hubArtifactTags.map((tag) => tag.slug)

  await prisma.hubArtifactTag.deleteMany({
    where: {
      slug: {
        notIn: activeSlugs
      }
    }
  })

  for (const tag of hubArtifactTags) {
    const tagRecord = await prisma.hubArtifactTag.upsert({
      where: {
        slug: tag.slug
      },
      update: {
        sortOrder: tag.sortOrder
      },
      create: {
        slug: tag.slug,
        sortOrder: tag.sortOrder
      }
    })

    for (const [locale, title] of Object.entries(tag.translations)) {
      await prisma.hubArtifactTagTranslation.upsert({
        where: {
          tagId_locale: {
            locale,
            tagId: tagRecord.id
          }
        },
        update: {
          title
        },
        create: {
          locale,
          tagId: tagRecord.id,
          title
        }
      })
    }
  }
}

async function backfillHubTopicTags() {
  const topics = await prisma.hubTopic.findMany({
    select: {
      category: true,
      id: true,
      tags: true
    }
  })

  for (const topic of topics) {
    const tags = Array.isArray(topic.tags)
      ? topic.tags.filter((tag): tag is string => typeof tag === 'string')
      : []

    if (tags.length === 0) {
      continue
    }

    const tagRecords = await prisma.hubTag.findMany({
      where: {
        category: topic.category,
        slug: {
          in: tags
        }
      },
      select: {
        id: true
      }
    })

    if (tagRecords.length === 0) {
      continue
    }

    await prisma.hubTopicTag.createMany({
      data: tagRecords.map((tag) => ({
        tagId: tag.id,
        topicId: topic.id
      })),
      skipDuplicates: true
    })
  }
}

async function templateFromManifestUrl(
  url: string,
  overrides: { image?: string } = {}
): Promise<AppTemplateSeed> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch template manifest ${url}: ${response.status}`)
  }

  const manifest = (await response.json()) as MoneyTemplateManifest
  return templateFromManifest(manifest, url, overrides)
}

function templateFromLocalManifest(
  relativePath: string,
  overrides: { image?: string; manifestUrl: string }
): AppTemplateSeed {
  const manifestPath = path.resolve(process.cwd(), relativePath)
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8')
  ) as MoneyTemplateManifest

  return templateFromManifest(manifest, overrides.manifestUrl, overrides)
}

type MoneyTemplateManifest = {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  status: 'available' | 'coming_soon'
  sortOrder?: number
  source: {
    repository: string
    remote: string
  }
  image?: string
  runtime: {
    appPort: number
    agentPort: number
  }
}

function templateFromManifest(
  manifest: MoneyTemplateManifest,
  manifestUrl: string,
  overrides: { image?: string } = {}
): AppTemplateSeed {
  const image = overrides.image ?? manifest.image

  return {
    id: manifest.id,
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    icon: manifest.icon,
    status: manifest.status,
    repository: manifest.source.repository,
    git: manifest.source.remote,
    image,
    appPort: manifest.runtime.appPort,
    agentPort: manifest.runtime.agentPort,
    sortOrder: manifest.sortOrder ?? 0,
    manifestUrl,
    manifest: {
      ...manifest,
      ...(image ? { image } : {})
    } as Prisma.InputJsonValue
  }
}
