import { type NextRequest } from 'next/server'

import { authenticateAuthToken } from '@/server/auth/tokens'

export async function authenticatePersonalMcpRequest(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? ''
  const [scheme, token] = authorization.split(/\s+/, 2)

  if (scheme.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  const context = await authenticateAuthToken({
    scope: 'personal:mcp',
    subjectType: 'user',
    token
  })

  if (!context?.user) {
    return null
  }

  return {
    tokenId: context.tokenId,
    user: context.user
  }
}
