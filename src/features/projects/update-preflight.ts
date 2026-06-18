import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { parseProjectResources } from '@/server/deploy/project-resources'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { listRepositoryCommits } from '@/server/integrations/forgejo'
import { projectMemberWhere } from '@/server/project-members'

type ProjectUpdatePreflightContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function handleProjectUpdatePreflightGet(
  _request: NextRequest,
  context: ProjectUpdatePreflightContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before updating applications', 401)
  }

  const { id } = await context.params
  const project = await prisma.project.findFirst({
    where: {
      OR: [{ id }, { slug: id }],
      members: projectMemberWhere(user.id, 'edit'),
      deletedAt: null
    },
    select: {
      id: true,
      resources: true
    }
  })

  if (!project) {
    return jsonErrorMessage('Application not found', 404)
  }

  const resources = parseProjectResources(project.resources)

  if (!resources.git) {
    return jsonOk({
      commits: [],
      hasChanges: false
    })
  }

  const commits = await listRepositoryCommits({
    limit: 5,
    owner: resources.git.owner,
    repository: resources.git.name
  })

  return jsonOk({
    commits,
    hasChanges: commits.length > 0
  })
}
