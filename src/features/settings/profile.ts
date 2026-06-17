import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { parseExperienceLevel } from '@/server/auth/profile'
import { jsonErrorMessage, jsonOk } from '@/server/http'

const UI_DELAY_MS = 250

export async function handleProfilePatch(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before updating settings', 401)
  }

  if (!user.onboarded) {
    return jsonErrorMessage('Complete onboarding first', 403)
  }

  const data = (await request.json().catch(() => null)) as {
    aiExperienceLevel?: unknown
    name?: unknown
    vibeCodingExperienceLevel?: unknown
  } | null
  const name = String(data?.name ?? '').trim()

  if (!name) {
    return jsonErrorMessage('Name is required', 400)
  }

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

function toFormValue(value: unknown) {
  return typeof value === 'string' ? value : null
}
