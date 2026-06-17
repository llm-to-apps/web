import { NextRequest } from 'next/server'

import { startProjectDevRuntime } from '@/features/projects/runtime'
import { getCurrentUser } from '@/server/auth'
import { jsonErrorMessage, jsonResult } from '@/server/http'

type ProjectDevStartContext = {
  params: Promise<unknown>
}

export async function handleProjectDevStartPost(
  _request: NextRequest,
  context: ProjectDevStartContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before starting development preview', 401)
  }

  const projectIdOrSlug = readProjectId(await context.params)

  if (!projectIdOrSlug) {
    return jsonErrorMessage('Application not found', 404)
  }

  return jsonResult(
    await startProjectDevRuntime({
      projectIdOrSlug,
      userId: user.id
    })
  )
}

function readProjectId(params: unknown) {
  if (
    params &&
    typeof params === 'object' &&
    'id' in params &&
    typeof params.id === 'string'
  ) {
    return params.id
  }

  return null
}
