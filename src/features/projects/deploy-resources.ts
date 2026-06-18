import { type ProjectResources } from '@/server/deploy/project-resources'
import { createProjectRepository } from '@/server/integrations/forgejo'
import { provisionProjectStorage } from '@/server/storage'
import { createProjectCredentials } from '@/platform/templates'

export async function createDeployResources({
  needsMysql,
  needsStorage,
  projectId
}: {
  needsMysql: boolean
  needsStorage: boolean
  projectId: string
}) {
  const projectRepository = await createProjectRepository(projectId)
  const credentials = needsMysql ? createProjectCredentials(projectId) : null
  const storageCredentials = needsStorage
    ? await provisionProjectStorage(projectId)
    : null
  const resourceState: ProjectResources = {
    git: {
      owner: projectRepository.owner,
      name: projectRepository.name,
      cloneUrl: projectRepository.cloneUrl,
      user: projectRepository.user
    },
    swarm: {
      serviceName: `app-${projectId}`
    }
  }

  if (credentials) {
    resourceState.mysql = {
      db: credentials.dbName,
      user: credentials.dbUser
    }
  }

  if (storageCredentials) {
    resourceState.storage = {
      accessKeyId: storageCredentials.accessKeyId,
      bucket: storageCredentials.bucket,
      user: storageCredentials.user
    }
  }

  return {
    credentials,
    projectRepository,
    resourceState,
    storageCredentials
  }
}
