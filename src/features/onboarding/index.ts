import { NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { parseExperienceLevel } from '@/server/auth/profile'
import { jsonErrorMessage, jsonOk } from '@/server/http'

export async function handleOnboardingPatch(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before completing onboarding', 401)
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

  await prisma.user.update({
    where: {
      id: user.id
    },
    data: {
      aiExperienceLevel: parseExperienceLevel(toFormValue(data?.aiExperienceLevel)),
      name,
      onboarded: true,
      vibeCodingExperienceLevel: parseExperienceLevel(
        toFormValue(data?.vibeCodingExperienceLevel)
      )
    }
  })

  return jsonOk()
}

function toFormValue(value: unknown) {
  return typeof value === 'string' ? value : null
}
