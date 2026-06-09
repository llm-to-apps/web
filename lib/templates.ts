import { randomBytes } from 'node:crypto';

export const templates = {
  money: {
    id: 'money',
    name: 'Money',
    git: 'git@github.com:llm-to-apps/money-template.git',
    image: 'ghcr.io/llm-to-apps/money-template:sha-dfa36b3',
    appPort: 3001,
    agentPort: 7001
  }
} as const;

export type TemplateId = keyof typeof templates;

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

export function createProjectCredentials(projectId: string) {
  const dbName = `project_${projectId}`;
  const dbUser = `project_${projectId}`;
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
