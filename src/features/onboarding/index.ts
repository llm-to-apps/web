import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { parseExperienceLevel } from '@/server/auth/profile'
import { isUsernameAvailable } from '@/server/auth/username'
import { jsonErrorMessage, jsonOk, jsonValidationError } from '@/server/http'
import { parseJsonRequest } from '@/shared/schema'
import { profileInputSchema } from '@/features/settings/schema'

export async function handleOnboardingPatch(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before completing onboarding', 401)
  }

  let data

  try {
    data = await parseJsonRequest(request, profileInputSchema)
  } catch (error) {
    return jsonValidationError(error)
  }

  const name = data.name
  const username = data.username

  if (!username) {
    return jsonErrorMessage('Username is required', 400)
  }

  const usernameAvailability = await isUsernameAvailable(username, user.id)

  if (!usernameAvailability.available) {
    return jsonErrorMessage(usernameAvailability.reason ?? 'Username is unavailable', 409)
  }

  await prisma.user.update({
    where: {
      id: user.id
    },
    data: {
      aiExperienceLevel: parseExperienceLevel(toFormValue(data?.aiExperienceLevel)),
      name,
      onboarded: true,
      username: usernameAvailability.normalized,
      vibeCodingExperienceLevel: parseExperienceLevel(
        toFormValue(data?.vibeCodingExperienceLevel)
      )
    }
  })

  return jsonOk()
}

function toFormValue(value: string | null | undefined) {
  return value ?? null
}
