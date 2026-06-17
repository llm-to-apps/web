import { type CurrentUser } from '@/server/auth'
import {
  managerUrl as readManagerUrl,
  platformDomain as readPlatformDomain,
  projectPublicScheme
} from '@/server/env'
import { createAgentToolsToken, createProjectId } from '@/platform/templates'
import { appOk, type AppResult } from '@/shared/result'
import { parseTemplateManifest } from '@/shared/templates/manifest'
import { createDeployTemplateEnv, provisionDeployOAuth } from './deploy-oauth'
import { createQueuedProjectRecord } from './deploy-project-record'
import { enqueueProjectDeploy } from './deploy-queue'
import { createDeployResources } from './deploy-resources'
import { buildManagerDeployPayload, createDevSlug } from './deploy-runtime'
import { loadInstallableTemplate, resolveDeploySlug } from './deploy-template'

export type DeployProjectRequest = {
  templateId?: string
  slug?: string
}

export type DeployProjectResult = {
  projectId: string
  url: string
  template: string
  status: string
  jobId: string | number | undefined
}

export async function deployProjectForUser({
  input,
  user
}: {
  input: DeployProjectRequest
  user: CurrentUser
}): Promise<AppResult<DeployProjectResult>> {
  const templateId = input.templateId ?? 'money'
  const templateResult = await loadInstallableTemplate(templateId)

  if (!templateResult.ok) {
    return templateResult
  }

  const template = templateResult.data
  const platformDomain = readPlatformDomain()
  const managerUrl = readManagerUrl()
  const publicScheme = projectPublicScheme()

  const id = createProjectId()
  const slugResult = await resolveDeploySlug({
    fallbackId: id,
    requestedSlug: input.slug,
    templateId: template.id
  })

  if (!slugResult.ok) {
    return slugResult
  }

  const slug = slugResult.data
  const agentToolsToken = createAgentToolsToken()
  const domain = `${slug}.${platformDomain}`
  const devSlug = createDevSlug(slug)
  const devDomain = `${devSlug}.${platformDomain}`
  const manifest = template.manifest ? parseTemplateManifest(template.manifest) : null
  const needsMysql = manifest?.services.mysql?.required ?? false
  const needsOauth = manifest?.services.oauth?.required ?? false
  const { credentials, projectRepository, resourceState } = await createDeployResources({
    needsMysql,
    projectId: id
  })

  const project = await createQueuedProjectRecord({
    agentToolsToken,
    devDomain,
    domain,
    id,
    projectRepositoryUrl: projectRepository.authenticatedCloneUrl,
    publicScheme,
    resourceState,
    slug,
    template,
    user
  })

  const oauthClient = await provisionDeployOAuth({
    domain,
    needsOauth,
    project,
    resourceState,
    template
  })
  const { projectServiceApiBaseUri, projectServiceToken, templateEnv } =
    await createDeployTemplateEnv({
      credentials,
      domain,
      manifest,
      oauthClient,
      project,
      publicScheme,
      template
    })

  const managerPayload = buildManagerDeployPayload({
    agentToolsToken,
    credentials,
    devDomain,
    domain,
    id,
    manifest,
    project,
    projectRepositoryUrl: projectRepository.authenticatedCloneUrl,
    projectServiceApiBaseUri,
    projectServiceToken,
    resourceState,
    template,
    templateEnv,
    user
  })

  const job = await enqueueProjectDeploy({
    managerPayload,
    managerUrl,
    projectId: project.id
  })

  return appOk({
    projectId: project.id,
    url: project.url,
    template: template.name,
    status: project.status,
    jobId: job.id
  })
}
