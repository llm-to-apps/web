import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { parseProjectResources } from '@/server/deploy/project-resources'
import { managerUrl as readManagerUrl } from '@/server/env'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { projectMemberWhere } from '@/server/project-members'

type ProjectUpdateContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function handleProjectUpdatePost(
  _request: NextRequest,
  context: ProjectUpdateContext
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
      resources: true,
      templateId: true
    }
  })

  if (!project) {
    return jsonErrorMessage('Application not found', 404)
  }

  const template = await prisma.appTemplate.findUnique({
    where: {
      id: project.templateId
    },
    select: {
      image: true
    }
  })

  if (!template?.image) {
    return jsonErrorMessage('Template image is not available', 409)
  }

  const resources = parseProjectResources(project.resources)
  const managerUrl = readManagerUrl()
  const response = await fetch(
    `${managerUrl}/swarm/projects/${encodeURIComponent(project.id)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: template.image,
        serviceName: resources.swarm?.serviceName
      })
    }
  )
  const result = (await response.json().catch(() => null)) as unknown

  if (!response.ok) {
    return jsonErrorMessage(
      `Manager update request failed with ${response.status}: ${JSON.stringify(result)}`,
      502
    )
  }

  await prisma.project.update({
    where: {
      id: project.id
    },
    data: {
      templateImage: template.image
    }
  })

  return jsonOk({
    image: template.image,
    message: 'Update started'
  })
}
