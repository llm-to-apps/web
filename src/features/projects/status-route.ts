import { NextRequest } from 'next/server'

import {
  getProjectRuntimeStatus,
  readProjectId
} from '@/features/projects/runtime-status'
import { getCurrentUser } from '@/server/auth'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { appErrorStatus } from '@/shared/result'

type ProjectStatusContext = {
  params: Promise<unknown>
}

export async function handleProjectStatusGet(
  _request: NextRequest,
  context: ProjectStatusContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before viewing applications', 401)
  }

  const projectIdOrSlug = readProjectId(await context.params)

  if (!projectIdOrSlug) {
    return jsonErrorMessage('Application not found', 404)
  }

  const result = await getProjectRuntimeStatus({
    projectIdOrSlug,
    userId: user.id
  })

  if (!result.ok) {
    return jsonErrorMessage(result.message, appErrorStatus(result.code), result.code)
  }

  return jsonOk(result.data, {
    headers: {
      'cache-control': 'no-store'
    }
  })
}
