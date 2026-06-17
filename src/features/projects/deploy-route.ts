import { NextRequest } from 'next/server'

import { deployProjectForUser } from '@/features/projects/deploy'
import { deployProjectRequestSchema } from '@/features/projects/schema'
import { getCurrentUser } from '@/server/auth'
import { jsonErrorMessage, jsonResult, jsonValidationError } from '@/server/http'
import { logError } from '@/server/logger'
import { parseJsonRequest } from '@/shared/schema'

export async function handleProjectDeployPost(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return jsonErrorMessage('Sign in before deploying an application', 401)
    }

    const input = await parseJsonRequest(request, deployProjectRequestSchema)

    return jsonResult(
      await deployProjectForUser({
        input,
        user
      })
    )
  } catch (error) {
    if (isValidationError(error)) {
      return jsonValidationError(error)
    }

    logError('projects.deploy.failed', {}, { error })

    return jsonErrorMessage(errorMessage(error), 500)
  }
}

function isValidationError(error: unknown) {
  return error instanceof Error && error.name === 'SchemaValidationError'
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Deploy failed'
}
