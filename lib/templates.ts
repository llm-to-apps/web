import { randomBytes } from 'node:crypto';

export const templates = {
  money: {
    id: 'money',
    name: 'Money',
    description: 'Personal finance dashboard with own database.',
    icon: 'money',
    repository: 'money-template',
    git: 'git@github.com:llm-to-apps/money-template.git',
    image: 'ghcr.io/llm-to-apps/money-template:sha-2f5b27b',
    appPort: 3001,
    agentPort: 7070
  },
  kanban: {
    id: 'kanban',
    name: 'Kanban',
    description: 'Visual task board for projects, cards, priorities, and workflows.',
    icon: 'kanban'
  },
  personalCrm: {
    id: 'personalCrm',
    name: 'Personal CRM',
    description: 'Lightweight contact manager with notes, follow-ups, and relationship history.',
    icon: 'crm'
  },
  habitTracker: {
    id: 'habitTracker',
    name: 'Habit Tracker',
    description: 'Daily habit tracking with streaks, goals, and progress insights.',
    icon: 'habits'
  },
  pomodoro: {
    id: 'pomodoro',
    name: 'Pomodoro',
    description: 'Focus timer with sessions, breaks, tasks, and productivity stats.',
    icon: 'pomodoro'
  },
  notes: {
    id: 'notes',
    name: 'Notes',
    description: 'Personal knowledge base with tags, search, and linked notes.',
    icon: 'notes'
  },
  mealPlanner: {
    id: 'mealPlanner',
    name: 'Meal Planner',
    description: 'Weekly meals, recipes, ingredients, and grocery planning.',
    icon: 'meal'
  },
  workoutTracker: {
    id: 'workoutTracker',
    name: 'Workout Tracker',
    description: 'Exercise plans, sets, progress history, and personal records.',
    icon: 'workout'
  },
  subscriptionTracker: {
    id: 'subscriptionTracker',
    name: 'Subscription Tracker',
    description: 'Track recurring payments, renewal dates, and monthly spending.',
    icon: 'subscriptions'
  },
  jobSearchCrm: {
    id: 'jobSearchCrm',
    name: 'Job Search CRM',
    description: 'Manage vacancies, companies, interviews, offers, and follow-ups.',
    icon: 'jobs'
  },
  moodJournal: {
    id: 'moodJournal',
    name: 'Mood Journal',
    description: 'Track mood, notes, triggers, habits, and emotional patterns.',
    icon: 'mood'
  },
  bookingCalendar: {
    id: 'bookingCalendar',
    name: 'Booking Calendar',
    description: 'Calendly-style scheduling app where people can book available time slots.',
    icon: 'booking'
  }
} as const;

export type TemplateId = keyof typeof templates;
export type Template = (typeof templates)[TemplateId];

export type InstallableTemplate = Template & {
  git: string;
  image: string;
  appPort: number;
  agentPort: number;
};

export function isInstallableTemplate(template: Template): template is InstallableTemplate {
  return 'git' in template && 'image' in template;
}

export function getInstallableTemplate(templateId: string) {
  const template = templates[templateId as TemplateId];

  if (!template || !isInstallableTemplate(template)) {
    return null;
  }

  return template;
}

export function cleanSubdomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function createProjectId() {
  return randomBytes(6).toString('hex');
}

export function createAgentToolsToken() {
  return randomBytes(32).toString('base64url');
}

export function createAppMcpToken() {
  return randomBytes(32).toString('base64url');
}

export function createProjectDatabaseNames(projectId: string) {
  const dbName = `project_${projectId}`;
  const dbUser = `project_${projectId}`;

  return {
    dbName,
    dbUser
  };
}

export function createProjectCredentials(projectId: string) {
  const { dbName, dbUser } = createProjectDatabaseNames(projectId);
  const dbPassword = randomBytes(18).toString('base64url');

  return {
    dbName,
    dbUser,
    dbPassword,
    databaseUrl: `mysql://${encodeURIComponent(dbUser)}:${encodeURIComponent(
      dbPassword
    )}@mysql:3306/${encodeURIComponent(dbName)}`
  };
}
