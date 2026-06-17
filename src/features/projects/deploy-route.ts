import { NextRequest } from 'next/server'

import {
  deployProjectForUser,
  type DeployProjectRequest
} from '@/features/projects/deploy'
import { getCurrentUser } from '@/server/auth'
import { jsonErrorMessage, jsonResult } from '@/server/http'

export async function handleProjectDeployPost(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return jsonErrorMessage('Sign in before deploying an application', 401)
    }

    return jsonResult(
      await deployProjectForUser({
        input: (await request.json()) as DeployProjectRequest,
        user
      })
    )
  } catch (error) {
    console.error('Failed to deploy project', error)

    return jsonErrorMessage(errorMessage(error), 500)
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Deploy failed'
}
