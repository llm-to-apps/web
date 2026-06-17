import { NextRequest } from 'next/server'

import { authenticateAuthToken } from '@/server/auth/tokens'
import { prisma } from '@/server/db'
import { jsonErrorMessage, jsonOk } from '@/server/http'

type HandshakeContext = {
  params: Promise<{ projectId: string }> | { projectId: string }
}

export async function handleS2SProjectHandshakePost(
  request: NextRequest,
  context: HandshakeContext
) {
  const { projectId } = await context.params
  const token = readBearerToken(request)

  if (!token) {
    return jsonErrorMessage('Unauthorized', 401)
  }

  const authContext = await authenticateAuthToken({
    projectId,
    scope: 'project:service',
    subjectType: 'project',
    token
  })

  if (!authContext?.projectId) {
    return jsonErrorMessage('Unauthorized', 401)
  }

  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id: projectId,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true,
      templateId: true,
      templateName: true
    }
  })

  if (!project) {
    return jsonErrorMessage('Project not found', 404)
  }

  return jsonOk({
    project,
    scope: 'project:service',
    tokenId: authContext.tokenId
  })
}

function readBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? ''
  const [scheme, token] = authorization.split(/\s+/, 2)

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token
}
