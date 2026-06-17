import { type ProjectResources } from '@/server/deploy/project-resources'
import { createProjectRepository } from '@/server/integrations/forgejo'
import { createProjectCredentials } from '@/platform/templates'

export async function createDeployResources({
  needsMysql,
  projectId
}: {
  needsMysql: boolean
  projectId: string
}) {
  const projectRepository = await createProjectRepository(projectId)
  const credentials = needsMysql ? createProjectCredentials(projectId) : null
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

  return {
    credentials,
    projectRepository,
    resourceState
  }
}
