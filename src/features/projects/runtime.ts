import { AgentToolsClient } from '@/server/agent/tools-client'
import { prisma } from '@/server/db'
import { projectMemberWhere } from '@/server/project-members'
import { appError, appOk, type AppResult } from '@/shared/result'

export type StartProjectDevResult = {
  started: true
}

export async function startProjectDevRuntime({
  projectIdOrSlug,
  userId
}: {
  projectIdOrSlug: string
  userId: string
}): Promise<AppResult<StartProjectDevResult>> {
  const project = await prisma.project.findFirst({
    where: {
      OR: [
        {
          id: projectIdOrSlug
        },
        {
          slug: projectIdOrSlug
        }
      ],
      members: projectMemberWhere(userId, 'edit'),
      deletedAt: null,
      status: 'ready'
    },
    select: {
      agentToolsToken: true,
      url: true
    }
  })

  if (!project?.agentToolsToken) {
    return appError(
      'NOT_FOUND',
      'Development tools are not available for this application'
    )
  }

  const toolsUrl = `${project.url.replace(/\/$/, '')}/agent-tools`
  const agentTools = new AgentToolsClient(toolsUrl, project.agentToolsToken)
  const status = await agentTools.status()

  if (status.dev?.running) {
    return appOk({ started: true })
  }

  const startResponse = await agentTools.startDev()

  if (startResponse.ok) {
    return appOk({ started: true })
  }

  const nextStatus = await agentTools.status()

  if (nextStatus.dev?.running) {
    return appOk({ started: true })
  }

  return appError('INTERNAL', 'Development server did not start')
}
