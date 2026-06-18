import { type Project } from '@prisma/client'

import { ensureAuthToken } from '@/server/auth/tokens'
import { type ProjectResources } from '@/server/deploy/project-resources'
import { prisma } from '@/server/db'
import { ensureProjectOAuthClient, oauthUrls } from '@/server/oauth'
import { type ProjectStorageCredentials } from '@/server/storage'
import { renderTemplateEnv, type TemplateManifest } from '@/shared/templates/manifest'

import { type InstallableAppTemplate } from './deploy-template'

export async function provisionDeployOAuth({
  domain,
  needsOauth,
  project,
  resourceState,
  template
}: {
  domain: string
  needsOauth: boolean
  project: Project
  resourceState: ProjectResources
  template: InstallableAppTemplate
}) {
  const oauthClient = needsOauth
    ? await ensureProjectOAuthClient({
        domain,
        name: `${template.name} (${project.id})`,
        projectId: project.id
      })
    : null

  if (oauthClient) {
    resourceState.oauth = {
      clientId: oauthClient.clientId,
      redirectUri: oauthClient.redirectUri
    }

    await prisma.project.update({
      where: {
        id: project.id
      },
      data: {
        resources: resourceState
      }
    })
  }

  return oauthClient
}

export async function createDeployTemplateEnv({
  credentials,
  domain,
  manifest,
  oauthClient,
  project,
  publicScheme,
  storageCredentials,
  template
}: {
  credentials: {
    dbName: string
    dbPassword: string
    dbUser: string
  } | null
  domain: string
  manifest: TemplateManifest | null
  oauthClient: {
    clientId: string
    clientSecret: string
    redirectUri: string
  } | null
  project: Project
  publicScheme: string
  storageCredentials: ProjectStorageCredentials | null
  template: InstallableAppTemplate
}) {
  const urls = oauthUrls()
  const projectServiceToken = await ensureAuthToken({
    name: `${template.name} service API`,
    projectId: project.id,
    scope: 'project:service',
    subjectType: 'project'
  })
  const internalApiBaseUrl = urls.internalToken.replace(/\/oauth\/token$/, '')
  const projectServiceApiBaseUri = `${internalApiBaseUrl}/api/s2s/projects/${project.id}`
  const templateEnv = manifest
    ? renderTemplateEnv(manifest, {
        app: {
          projectId: project.id,
          publicUrl: `${publicScheme}://${domain}`
        },
        services: {
          ...(credentials
            ? {
                mysql: {
                  database: credentials.dbName,
                  user: credentials.dbUser,
                  password: credentials.dbPassword
                }
              }
            : {}),
          ...(storageCredentials
            ? {
                storage: {
                  accessKeyId: storageCredentials.accessKeyId,
                  bucket: storageCredentials.bucket,
                  endpoint: storageCredentials.endpoint,
                  forcePathStyle: storageCredentials.forcePathStyle,
                  internalEndpoint: storageCredentials.internalEndpoint,
                  region: storageCredentials.region,
                  secretAccessKey: storageCredentials.secretAccessKey
                }
              }
            : {}),
          ...(oauthClient
            ? {
                oauth: {
                  clientId: oauthClient.clientId,
                  clientSecret: oauthClient.clientSecret,
                  redirectUri: oauthClient.redirectUri,
                  issuerUrl: urls.issuer,
                  authorizeUrl: urls.authorize,
                  tokenUrl: urls.token,
                  userinfoUrl: urls.userinfo,
                  internalTokenUrl: urls.internalToken,
                  internalUserinfoUrl: urls.internalUserinfo,
                  internalProjectUserTokenIntrospectionUrl:
                    urls.internalProjectUserTokenIntrospection,
                  projectUserTokenIntrospectionUrl: urls.projectUserTokenIntrospection,
                  projectServiceApiToken: projectServiceToken.token,
                  projectServiceApiBaseUri,
                  requestHost: urls.requestHost
                }
              }
            : {})
        }
      })
    : {}

  return {
    projectServiceApiBaseUri,
    projectServiceToken,
    templateEnv
  }
}
