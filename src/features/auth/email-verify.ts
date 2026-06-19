import { NextRequest } from 'next/server'

import {
  createSession,
  isDevelopmentEmailCodeEnabled,
  isValidEmail,
  normalizeEmail
} from '@/server/auth'
import { prisma } from '@/server/db'
import { verifyEmailLoginCode } from '@/server/auth/email-login-codes'
import { withAvailableUsernameRetry } from '@/server/auth/username'
import { jsonErrorMessage, jsonOk, jsonValidationError } from '@/server/http'
import { logError } from '@/server/logger'
import { parseJsonRequest } from '@/shared/schema'
import { verifyEmailAuthRequestSchema } from './schema'

export async function handleEmailVerifyPost(request: NextRequest) {
  let body

  try {
    body = await parseJsonRequest(request, verifyEmailAuthRequestSchema)
  } catch (error) {
    return jsonValidationError(error)
  }
  const email = normalizeEmail(body.email ?? '')
  const code = body.code

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
    logError('auth.email_code.verify.failed', { email }, { error })
    return jsonErrorMessage('Failed to verify email code', 503)
  }

  if (!isValidEmailCode && !isDevelopmentEmailCodeEnabled()) {
    return jsonErrorMessage('Invalid or expired code', 400)
  }

  const user = await withAvailableUsernameRetry(email, (username) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        username
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        onboarded: true,
        aiExperienceLevel: true,
        vibeCodingExperienceLevel: true,
        onboardingGoal: true
      }
    })
  )

  await createSession(user)

  return jsonOk({
    user
  })
}
