const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');
import type { Prisma } from '@prisma/client';

type AppTemplateSeed = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  status: 'available' | 'coming_soon';
  repository?: string;
  git?: string;
  image?: string;
  appPort?: number;
  agentPort?: number;
  sortOrder: number;
  manifestUrl?: string;
  manifest?: Prisma.InputJsonValue;
};

type UsagePriceSeed = {
  id: string;
  meterType: string;
  provider?: string | null;
  model?: string | null;
  unit: string;
  inputCredits?: string | null;
  outputCredits?: string | null;
  unitCredits?: string | null;
  inputCostUsd?: string | null;
  outputCostUsd?: string | null;
  unitCostUsd?: string | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
};

const prisma = new PrismaClient();
const moneyTemplateManifestCommit = 'a5046f1893be547c944d3d079eb2f31e59703312';
const moneyTemplateManifestBaseUrl = `https://cdn.jsdelivr.net/gh/llm-to-apps/money-template@${moneyTemplateManifestCommit}`;

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
    description: 'Lightweight contact manager with notes, follow-ups, and relationship history.',
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
    description: 'Calendly-style scheduling app where people can book available time slots.',
    icon: 'booking',
    status: 'coming_soon',
    sortOrder: 120
  }
];

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
];

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function main() {
  await seedAppTemplates();
  await seedUsagePrices();
}

async function seedAppTemplates() {
  const appTemplates = [
    await templateFromManifestUrl(`${moneyTemplateManifestBaseUrl}/manifest.json`),
    ...staticAppTemplates
  ];

  await prisma.appTemplate.deleteMany({
    where: {
      id: 'money-dev'
    }
  });

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
    });
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
    });
  }
}

async function templateFromManifestUrl(url: string): Promise<AppTemplateSeed> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch template manifest ${url}: ${response.status}`);
  }

  const manifest = (await response.json()) as {
    id: string;
    slug: string;
    name: string;
    description: string;
    icon: string;
    status: 'available' | 'coming_soon';
    sortOrder?: number;
    source: {
      repository: string;
      remote: string;
    };
    image?: string;
    runtime: {
      appPort: number;
      agentPort: number;
    };
  };

  return {
    id: manifest.id,
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    icon: manifest.icon,
    status: manifest.status,
    repository: manifest.source.repository,
    git: manifest.source.remote,
    image: manifest.image,
    appPort: manifest.runtime.appPort,
    agentPort: manifest.runtime.agentPort,
    sortOrder: manifest.sortOrder ?? 0,
    manifestUrl: url,
    manifest: manifest as Prisma.InputJsonValue
  };
}
