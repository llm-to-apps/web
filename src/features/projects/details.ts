import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { getDeployQueue } from '@/server/deploy/queue'
import { prisma } from '@/server/db'
import { managerUrl as readManagerUrl } from '@/server/env'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { projectMemberWhere } from '@/server/project-members'
import { parseProjectResources } from '@/server/deploy/project-resources'

type ProjectRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function handleProjectGet(
  _request: NextRequest,
  context: ProjectRouteContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before viewing applications', 401)
  }

  const { id } = await context.params
  const project = await prisma.project.findFirst({
    where: {
      id,
      members: projectMemberWhere(user.id)
    },
    select: {
      id: true,
      templateId: true,
      templateName: true,
      slug: true,
      domain: true,
      url: true,
      status: true,
      deletedAt: true,
      deployError: true
    }
  })

  if (!project) {
    return jsonErrorMessage('Application not found', 404)
  }

  return jsonOk({
    project
  })
}

export async function handleProjectDelete(
  _request: NextRequest,
  context: ProjectRouteContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before deleting applications', 401)
  }

  const { id } = await context.params
  const project = await prisma.project.findFirst({
    where: {
      id,
      members: projectMemberWhere(user.id, 'admin'),
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true,
      resources: true
    }
  })

  if (!project) {
    return jsonErrorMessage('Application not found', 404)
  }

  await prisma.project.update({
    where: { id },
    data: {
      status: 'deleting',
      deployError: null
    }
  })

  const deployQueue = getDeployQueue()
  const deployJob = await deployQueue.getJob(id)
  const readyJob = await deployQueue.getJob(`ready-${id}`)
  const deleteJob = await deployQueue.getJob(`delete-${id}`)

  if (deployJob) {
    await deployJob.remove().catch(() => null)
  }

  if (readyJob) {
    await readyJob.remove().catch(() => null)
  }

  if (deleteJob) {
    await deleteJob.remove().catch(() => null)
  }

  const managerUrl = readManagerUrl()
  const resources = parseProjectResources(project.resources)
  await deployQueue.add(
    'delete-project',
    {
      projectId: id,
      managerUrl,
      resources
    },
    {
      jobId: `delete-${id}`,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5_000
      }
    }
  )

  return jsonOk({
    projectId: id
  })
}
