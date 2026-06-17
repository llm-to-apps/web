import { NextRequest } from 'next/server'

import {
  createSession,
  isDevelopmentEmailCodeEnabled,
  isValidEmail,
  normalizeEmail
} from '@/server/auth'
import { prisma } from '@/server/db'
import { verifyEmailLoginCode } from '@/server/auth/email-login-codes'
import { jsonErrorMessage, jsonOk } from '@/server/http'

type VerifyEmailAuthRequest = {
  code?: string
  email?: string
}

export async function handleEmailVerifyPost(request: NextRequest) {
  const body = (await request.json()) as VerifyEmailAuthRequest
  const email = normalizeEmail(body.email ?? '')
  const code = body.code?.trim() ?? ''

  if (!isValidEmail(email)) {
    return jsonErrorMessage('A valid email is required', 400)
  }

  if (!code) {
    return jsonErrorMessage('Code is required', 400)
  }

  let isValidEmailCode = false

  try {
    isValidEmailCode = await verifyEmailLoginCode(email, code)
  } catch (error) {
    console.error('[Auth] Failed to verify email login code', { email, error })
    return jsonErrorMessage('Failed to verify email code', 503)
  }

  if (!isValidEmailCode && !isDevelopmentEmailCodeEnabled()) {
    return jsonErrorMessage('Invalid or expired code', 400)
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email
    },
    select: {
      id: true,
      email: true,
      name: true,
      onboarded: true,
      aiExperienceLevel: true,
      vibeCodingExperienceLevel: true,
      onboardingGoal: true
    }
  })

  await createSession(user)

  return jsonOk({
    user
  })
}
