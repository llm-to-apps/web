import { NextRequest } from 'next/server'

import { isValidEmail, normalizeEmail } from '@/server/auth'
import { prisma } from '@/server/db'
import { sendEmail } from '@/server/integrations/email'
import {
  clearEmailLoginCode,
  createEmailLoginCode
} from '@/server/auth/email-login-codes'
import { jsonErrorMessage, jsonOk } from '@/server/http'

type StartEmailAuthRequest = {
  email?: string
}

export async function handleEmailStartPost(request: NextRequest) {
  const body = (await request.json()) as StartEmailAuthRequest
  const email = normalizeEmail(body.email ?? '')

  if (!isValidEmail(email)) {
    return jsonErrorMessage('A valid email is required', 400)
  }

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email
    }
  })

  let loginCode: Awaited<ReturnType<typeof createEmailLoginCode>>

  try {
    loginCode = await createEmailLoginCode(email)
  } catch (error) {
    console.error('[Auth] Failed to store email login code', { email, error })
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
    console.error('[Auth] Failed to send email login code', { email, error })
    return jsonErrorMessage('Failed to send email code', 502)
  }

  return jsonOk()
}
