import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { createAuthToken } from '@/server/auth/tokens'
import { jsonErrorMessage, jsonOk, jsonValidationError } from '@/server/http'
import { parseJsonRequest } from '@/shared/schema'
import { createPersonalMcpTokenRequestSchema } from './schema'

export async function handleUserMcpTokensGet() {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in required', 401)
  }

  const tokens = await prisma.authToken.findMany({
    where: {
      subjectType: 'user',
      userId: user.id,
      scope: 'personal:mcp',
      revokedAt: null
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true,
      name: true,
      tokenLast4: true,
      lastUsedAt: true,
      createdAt: true
    }
  })

  return jsonOk({ tokens })
}

export async function handleUserMcpTokensPost(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in required', 401)
  }

  let body

  try {
    body = await parseJsonRequest(request, createPersonalMcpTokenRequestSchema)
  } catch (error) {
    return jsonValidationError(error)
  }

  const token = await createAuthToken({
    subjectType: 'user',
    userId: user.id,
    scope: 'personal:mcp',
    name: body.name?.trim() || 'Personal OS MCP'
  })

  return jsonOk({
    token
  })
}
