import { randomBytes, randomInt } from 'node:crypto';

export type TemplateId = string;

export type Template = {
  id: string;
  status: string;
  git: string | null;
  image: string | null;
  appPort: number | null;
  agentPort: number | null;
};

export type InstallableTemplate = Template & {
  git: string;
  image: string;
  appPort: number;
  agentPort: number;
};

export function isInstallableTemplate(template: Template): template is InstallableTemplate {
  return (
    template.status === 'available' &&
    Boolean(template.git) &&
    Boolean(template.image) &&
    typeof template.appPort === 'number' &&
    typeof template.agentPort === 'number'
  );
}

export function cleanSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function createProjectId() {
  const timestamp = Date.now().toString(36).padStart(9, '0');
  const randomSuffix = randomInt(36 ** 2).toString(36).padStart(2, '0');

  return `${timestamp}${randomSuffix}`;
}

export function createAgentToolsToken() {
  return randomBytes(32).toString('base64url');
}

export function createProjectDatabaseNames(projectId: string) {
  const dbName = `app_${projectId}`;
  const dbUser = `app_${projectId}`;

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
