import { type ManagerDeployAppPayload } from '@/server/deploy/manager-client'
import { type ProjectResources } from '@/server/deploy/project-resources'
import { type TemplateManifest } from '@/shared/templates/manifest'

type DeployTemplate = {
  id: string
  image: string
  appPort: number
  agentPort: number
}

type DeployCredentials = {
  dbName: string
  dbUser: string
  dbPassword: string
  databaseUrl: string
}

export function createDevSlug(slug: string) {
  const reversed = slug.split('').reverse().join('')

  if (reversed === slug) {
    return `dev-${slug}`
  }

  return reversed
}

export function buildManagerDeployPayload({
  agentToolsToken,
  credentials,
  devDomain,
  domain,
  id,
  manifest,
  project,
  projectRepositoryUrl,
  projectServiceApiBaseUri,
  projectServiceToken,
  resourceState,
  template,
  templateEnv,
  user
}: {
  agentToolsToken: string
  credentials: DeployCredentials | null
  devDomain: string
  domain: string
  id: string
  manifest: TemplateManifest | null
  project: {
    id: string
  }
  projectRepositoryUrl: string
  projectServiceApiBaseUri: string
  projectServiceToken: {
    token: string
  }
  resourceState: ProjectResources
  template: DeployTemplate
  templateEnv: Record<string, string>
  user: {
    email: string
    id: string
  }
}): ManagerDeployAppPayload {
  return {
    id,
    git: projectRepositoryUrl,
    image: template.image,
    serviceName: resourceState.swarm?.serviceName,
    services: credentials
      ? {
          mysql: {
            db: credentials.dbName,
            user: credentials.dbUser,
            password: credentials.dbPassword
          }
        }
      : {},
    env: {
      TEMPLATE_ID: template.id,
      PROJECT_ID: project.id,
      PROJECT_SERVICE_API_TOKEN: projectServiceToken.token,
      PROJECT_SERVICE_API_BASE_URI: projectServiceApiBaseUri,
      USER_ID: user.id,
      USER_EMAIL: user.email,
      ...templateEnv,
      ...(credentials
        ? {
            MYSQL_HOST: 'mysql',
            MYSQL_PORT: '3306',
            MYSQL_DATABASE: credentials.dbName,
            MYSQL_USER: credentials.dbUser,
            MYSQL_PASSWORD: credentials.dbPassword,
            DATABASE_URL: credentials.databaseUrl
          }
        : {}),
      GIT_REPO_URL: projectRepositoryUrl,
      GIT_BRANCH: 'main',
      ...(manifest?.git.mount.preserve?.length
        ? { GIT_PRESERVE_PATHS: manifest.git.mount.preserve.join(':') }
        : {}),
      ...(manifest?.runtime.restoreCommand
        ? { APP_RESTORE_COMMAND: manifest.runtime.restoreCommand }
        : {}),
      ...(manifest?.runtime.startupCommands
        ? { APP_STARTUP_COMMANDS: manifest.runtime.startupCommands }
        : {}),
      AGENT_TOOLS_TOKEN: agentToolsToken
    },
    domain,
    devDomain,
    resources: manifest?.resources,
    ports: {
      app: template.appPort,
      agent: template.agentPort,
      dev: manifest?.runtime.devPort ?? 4046
    }
  }
}
