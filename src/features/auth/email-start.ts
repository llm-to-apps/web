import { NextRequest } from 'next/server'

import { isValidEmail, normalizeEmail } from '@/server/auth'
import { prisma } from '@/server/db'
import { sendEmail } from '@/server/integrations/email'
import {
  clearEmailLoginCode,
  createEmailLoginCode
} from '@/server/auth/email-login-codes'
import { withAvailableUsernameRetry } from '@/server/auth/username'
import { jsonErrorMessage, jsonOk, jsonValidationError } from '@/server/http'
import { logError } from '@/server/logger'
import { parseJsonRequest } from '@/shared/schema'
import { startEmailAuthRequestSchema } from './schema'

export async function handleEmailStartPost(request: NextRequest) {
  let body

  try {
    body = await parseJsonRequest(request, startEmailAuthRequestSchema)
  } catch (error) {
    return jsonValidationError(error)
  }

  const email = normalizeEmail(body.email ?? '')

  if (!isValidEmail(email)) {
    return jsonErrorMessage('A valid email is required', 400)
  }

  await withAvailableUsernameRetry(email, (username) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        username
      }
    })
  )

  let loginCode: Awaited<ReturnType<typeof createEmailLoginCode>>

  try {
    loginCode = await createEmailLoginCode(email)
  } catch (error) {
    logError('auth.email_code.store.failed', { email }, { error })
    return jsonErrorMessage('Failed to create email code', 503)
  }

  try {
    await sendEmail({
      html: `<p>Your OS7 sign-in code is <strong>${loginCode.code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
      subject: 'Your OS7 sign-in code',
      text: `Your OS7 sign-in code is ${loginCode.code}. This code expires in 10 minutes.`,
      to: email
    })
  } catch (error) {
    await clearEmailLoginCode(email).catch(() => undefined)
    logError('auth.email_code.send.failed', { email }, { error })
    return jsonErrorMessage('Failed to send email code', 502)
  }

  return jsonOk()
}
