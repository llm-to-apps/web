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
  translations?: TemplateTranslationSeed
  icon: string
  status: 'available' | 'coming_soon'
  repository?: string
  git?: string
  image?: string
  appPort?: number
  agentPort?: number
  hubTopicId?: string
  sortOrder: number
  manifestUrl?: string
  manifest?: Prisma.InputJsonValue
}

type TemplateTranslationSeed = Record<
  'de' | 'en' | 'ru',
  {
    description: string
    name: string
  }
>

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

const appTemplateTranslations: Record<string, TemplateTranslationSeed> = {
  bookingCalendar: {
    de: {
      name: 'Buchungskalender',
      description: 'Calendly-ähnliche Terminplanung, bei der Personen freie Slots buchen.'
    },
    en: {
      name: 'Booking Calendar',
      description:
        'Calendly-style scheduling app where people can book available time slots.'
    },
    ru: {
      name: 'Календарь бронирований',
      description: 'Приложение как Calendly, где люди могут бронировать свободное время.'
    }
  },
  habitTracker: {
    de: {
      name: 'Gewohnheiten',
      description: 'Tägliches Habit-Tracking mit Serien, Zielen und Fortschrittsanalysen.'
    },
    en: {
      name: 'Habit Tracker',
      description: 'Daily habit tracking with streaks, goals, and progress insights.'
    },
    ru: {
      name: 'Привычки',
      description: 'Трекер ежедневных привычек со streaks, целями и прогрессом.'
    }
  },
  jobSearchCrm: {
    de: {
      name: 'Jobsuche CRM',
      description: 'Verwalte Stellen, Unternehmen, Interviews, Angebote und Follow-ups.'
    },
    en: {
      name: 'Job Search CRM',
      description: 'Manage vacancies, companies, interviews, offers, and follow-ups.'
    },
    ru: {
      name: 'Поиск работы',
      description: 'Управление вакансиями, компаниями, интервью, офферами и follow-up.'
    }
  },
  kanban: {
    de: {
      name: 'Kanban',
      description: 'Visuelles Taskboard für Projekte, Karten, Prioritäten und Workflows.'
    },
    en: {
      name: 'Kanban',
      description: 'Visual task board for projects, cards, priorities, and workflows.'
    },
    ru: {
      name: 'Kanban',
      description:
        'Визуальная доска задач для проектов, карточек, приоритетов и процессов.'
    }
  },
  mealPlanner: {
    de: {
      name: 'Essensplaner',
      description: 'Wochenmahlzeiten, Rezepte, Zutaten und Einkaufsplanung.'
    },
    en: {
      name: 'Meal Planner',
      description: 'Weekly meals, recipes, ingredients, and grocery planning.'
    },
    ru: {
      name: 'Питание',
      description: 'Планирование еды на неделю, рецепты, ингредиенты и список покупок.'
    }
  },
  money: {
    de: {
      name: 'Finanzen',
      description: 'Persönliches Finanz-Dashboard mit eigener Datenbank.'
    },
    en: {
      name: 'Money',
      description: 'Personal finance dashboard with own database.'
    },
    ru: {
      name: 'Финансы',
      description: 'Персональный финансовый дашборд с собственной базой данных.'
    }
  },
  moodJournal: {
    de: {
      name: 'Stimmungstagebuch',
      description:
        'Stimmung, Notizen, Auslöser, Gewohnheiten und emotionale Muster verfolgen.'
    },
    en: {
      name: 'Mood Journal',
      description: 'Track mood, notes, triggers, habits, and emotional patterns.'
    },
    ru: {
      name: 'Настроение',
      description:
        'Трекер настроения, заметок, триггеров, привычек и эмоциональных паттернов.'
    }
  },
  notes: {
    de: {
      name: 'Notizen',
      description: 'Persönliche Wissensbasis mit Tags, Suche und verknüpften Notizen.'
    },
    en: {
      name: 'Notes',
      description: 'Personal knowledge base with tags, search, and linked notes.'
    },
    ru: {
      name: 'Заметки',
      description: 'Личная база знаний с тегами, поиском и связанными заметками.'
    }
  },
  personalCrm: {
    de: {
      name: 'Persönliches CRM',
      description:
        'Leichte Kontaktverwaltung mit Notizen, Follow-ups und Beziehungshistorie.'
    },
    en: {
      name: 'Personal CRM',
      description:
        'Lightweight contact manager with notes, follow-ups, and relationship history.'
    },
    ru: {
      name: 'Личный CRM',
      description:
        'Легкий менеджер контактов с заметками, follow-up и историей отношений.'
    }
  },
  pomodoro: {
    de: {
      name: 'Pomodoro',
      description:
        'Fokus-Timer mit Sessions, Pausen, Aufgaben und Produktivitätsstatistiken.'
    },
    en: {
      name: 'Pomodoro',
      description: 'Focus timer with sessions, breaks, tasks, and productivity stats.'
    },
    ru: {
      name: 'Pomodoro',
      description:
        'Фокус-таймер с сессиями, перерывами, задачами и статистикой продуктивности.'
    }
  },
  subscriptionTracker: {
    de: {
      name: 'Abos',
      description:
        'Wiederkehrende Zahlungen, Verlängerungen und monatliche Ausgaben verfolgen.'
    },
    en: {
      name: 'Subscription Tracker',
      description: 'Track recurring payments, renewal dates, and monthly spending.'
    },
    ru: {
      name: 'Подписки',
      description: 'Отслеживание регулярных платежей, продлений и месячных расходов.'
    }
  },
  workoutTracker: {
    de: {
      name: 'Training',
      description: 'Trainingspläne, Sätze, Fortschrittshistorie und persönliche Rekorde.'
    },
    en: {
      name: 'Workout Tracker',
      description: 'Exercise plans, sets, progress history, and personal records.'
    },
    ru: {
      name: 'Тренировки',
      description: 'Планы упражнений, подходы, история прогресса и личные рекорды.'
    }
  }
}

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
      en: 'Finance',
      ru: 'Финансы'
    },
    slug: 'finance',
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
      de: 'Marketing',
      en: 'Marketing',
      ru: 'Маркетинг'
    },
    slug: 'marketing',
    sortOrder: 30
  },
  {
    category: 'business',
    translations: {
      de: 'Betrieb',
      en: 'Operations',
      ru: 'Операции'
    },
    slug: 'operations',
    sortOrder: 40
  },
  {
    category: 'business',
    translations: {
      de: 'Projektmanagement',
      en: 'Project management',
      ru: 'Управление проектами'
    },
    slug: 'project-management',
    sortOrder: 50
  },
  {
    category: 'business',
    translations: {
      de: 'HR',
      en: 'HR',
      ru: 'HR'
    },
    slug: 'hr',
    sortOrder: 60
  },
  {
    category: 'business',
    translations: {
      de: 'Support',
      en: 'Support',
      ru: 'Поддержка'
    },
    slug: 'support',
    sortOrder: 70
  },
  {
    category: 'business',
    translations: {
      de: 'Analytik',
      en: 'Analytics',
      ru: 'Аналитика'
    },
    slug: 'analytics',
    sortOrder: 80
  },
  {
    category: 'business',
    translations: {
      de: 'Inventar',
      en: 'Inventory',
      ru: 'Склад'
    },
    slug: 'inventory',
    sortOrder: 90
  },
  {
    category: 'business',
    translations: {
      de: 'Dokumente',
      en: 'Documents',
      ru: 'Документы'
    },
    slug: 'documents',
    sortOrder: 100
  },
  {
    category: 'business',
    translations: {
      de: 'Automatisierung',
      en: 'Automation',
      ru: 'Автоматизация'
    },
    slug: 'automation',
    sortOrder: 110
  },
  {
    category: 'business',
    translations: {
      de: 'Wissensdatenbank',
      en: 'Knowledge base',
      ru: 'База знаний'
    },
    slug: 'knowledge-base',
    sortOrder: 120
  },
  {
    category: 'personal',
    translations: {
      de: 'Produktivität',
      en: 'Productivity',
      ru: 'Продуктивность'
    },
    slug: 'productivity',
    sortOrder: 10
  },
  {
    category: 'personal',
    translations: {
      de: 'Finanzen',
      en: 'Finance',
      ru: 'Финансы'
    },
    slug: 'finance',
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
  },
  {
    category: 'personal',
    translations: {
      de: 'Lernen',
      en: 'Learning',
      ru: 'Обучение'
    },
    slug: 'learning',
    sortOrder: 40
  },
  {
    category: 'personal',
    translations: {
      de: 'Zuhause',
      en: 'Home',
      ru: 'Дом'
    },
    slug: 'home',
    sortOrder: 50
  },
  {
    category: 'personal',
    translations: {
      de: 'Planung',
      en: 'Planning',
      ru: 'Планирование'
    },
    slug: 'planning',
    sortOrder: 60
  },
  {
    category: 'personal',
    translations: {
      de: 'Reisen',
      en: 'Travel',
      ru: 'Путешествия'
    },
    slug: 'travel',
    sortOrder: 70
  },
  {
    category: 'personal',
    translations: {
      de: 'Dokumente',
      en: 'Documents',
      ru: 'Документы'
    },
    slug: 'documents',
    sortOrder: 80
  },
  {
    category: 'personal',
    translations: {
      de: 'Kreativität',
      en: 'Creative',
      ru: 'Творчество'
    },
    slug: 'creative',
    sortOrder: 90
  },
  {
    category: 'personal',
    translations: {
      de: 'Kontakte',
      en: 'Social',
      ru: 'Контакты'
    },
    slug: 'social',
    sortOrder: 100
  },
  {
    category: 'personal',
    translations: {
      de: 'Gewohnheiten',
      en: 'Habits',
      ru: 'Привычки'
    },
    slug: 'habits',
    sortOrder: 110
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
    const templateRecord = await prisma.appTemplate.upsert({
      where: {
        id: template.id
      },
      update: {
        agentPort: template.agentPort ?? null,
        appPort: template.appPort ?? null,
        description: template.description,
        git: template.git ?? null,
        hubTopicId: template.hubTopicId ?? null,
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
        hubTopicId: template.hubTopicId ?? null,
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

    const translations = template.translations ??
      appTemplateTranslations[template.id] ?? {
        en: {
          description: template.description,
          name: template.name
        }
      }

    for (const [locale, translation] of Object.entries(translations)) {
      await prisma.appTemplateTranslation.upsert({
        where: {
          templateId_locale: {
            locale,
            templateId: templateRecord.id
          }
        },
        update: {
          description: translation.description,
          name: translation.name
        },
        create: {
          description: translation.description,
          locale,
          name: translation.name,
          templateId: templateRecord.id
        }
      })
    }
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
  const activeTagsByCategory = hubTags.reduce<Record<string, string[]>>((acc, tag) => {
    acc[tag.category] ??= []
    acc[tag.category].push(tag.slug)
    return acc
  }, {})

  for (const [category, slugs] of Object.entries(activeTagsByCategory)) {
    await prisma.hubTag.deleteMany({
      where: {
        category,
        slug: {
          notIn: slugs
        }
      }
    })
  }

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
