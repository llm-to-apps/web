import { randomBytes } from 'node:crypto';

export const templates = {
  money: {
    id: 'money',
    name: 'Money',
    description: 'Personal finance dashboard with MySQL-backed data.',
    repository: 'money-template',
    git: 'git@github.com:llm-to-apps/money-template.git',
    image: 'ghcr.io/llm-to-apps/money-template:sha-2f5b27b',
    appPort: 3001,
    agentPort: 7070
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
