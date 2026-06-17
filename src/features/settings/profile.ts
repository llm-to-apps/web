import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { parseExperienceLevel } from '@/server/auth/profile'
import { jsonErrorMessage, jsonOk, jsonValidationError } from '@/server/http'
import { parseJsonRequest } from '@/shared/schema'
import { profileInputSchema } from './schema'

const UI_DELAY_MS = 250

export async function handleProfilePatch(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before updating settings', 401)
  }

  if (!user.onboarded) {
    return jsonErrorMessage('Complete onboarding first', 403)
  }

  let data

  try {
    data = await parseJsonRequest(request, profileInputSchema)
  } catch (error) {
    return jsonValidationError(error)
  }

  const name = data.name

  await waitForUiDelay()

  await prisma.user.update({
    where: {
      id: user.id
    },
    data: {
      aiExperienceLevel: parseExperienceLevel(toFormValue(data?.aiExperienceLevel)),
      name,
      vibeCodingExperienceLevel: parseExperienceLevel(
        toFormValue(data?.vibeCodingExperienceLevel)
      )
    }
  })

  return jsonOk()
}

function waitForUiDelay() {
  return new Promise((resolve) => {
    setTimeout(resolve, UI_DELAY_MS)
  })
}

function toFormValue(value: string | null | undefined) {
  return value ?? null
}
