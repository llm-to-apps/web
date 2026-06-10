const { execFileSync } = require('node:child_process') as typeof import('node:child_process');

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
};

const appTemplates: AppTemplateSeed[] = [
  {
    id: 'money',
    slug: 'money',
    name: 'Money',
    description: 'Personal finance dashboard with own database.',
    icon: 'money',
    status: 'available',
    repository: 'money-template',
    git: 'git@github.com:llm-to-apps/money-template.git',
    image: 'ghcr.io/llm-to-apps/money-template:sha-aee8dcd',
    appPort: 3001,
    agentPort: 7070,
    sortOrder: 10
  },
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

const columns = [
  'id',
  'slug',
  'name',
  'description',
  'icon',
  'status',
  'repository',
  'git',
  'image',
  'appPort',
  'agentPort',
  'sortOrder',
  'createdAt',
  'updatedAt'
];

const values = appTemplates
  .map((template) =>
    [
      template.id,
      template.slug,
      template.name,
      template.description,
      template.icon,
      template.status,
      template.repository ?? null,
      template.git ?? null,
      template.image ?? null,
      template.appPort ?? null,
      template.agentPort ?? null,
      template.sortOrder,
      { raw: 'now()' },
      { raw: 'now()' }
    ]
      .map(sqlValue)
      .join(', ')
  )
  .map((row) => `(${row})`)
  .join(',\n');

const assignments = columns
  .filter((column) => !['id', 'createdAt', 'updatedAt'].includes(column))
  .map((column) => `"${column}" = EXCLUDED."${column}"`)
  .concat('"updatedAt" = now()')
  .join(',\n');

const sql = `
INSERT INTO "app_templates" (${columns.map((column) => `"${column}"`).join(', ')})
VALUES
${values}
ON CONFLICT ("id") DO UPDATE SET
${assignments};
`;

execFileSync(
  process.execPath,
  ['./node_modules/prisma/build/index.js', 'db', 'execute', '--schema', 'prisma/schema.prisma', '--stdin'],
  {
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit']
  }
);

function sqlValue(value: string | number | { raw: string } | null) {
  if (value === null) {
    return 'NULL';
  }

  if (typeof value === 'object') {
    return value.raw;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return `'${value.replace(/'/g, "''")}'`;
}
