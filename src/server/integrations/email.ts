import { emailFrom, isProductionEnv, resendApiKey } from '../env'
import { logInfo } from '../logger'

type SendEmailInput = {
  html?: string
  subject: string
  text: string
  to: string
}

type ResendSendEmailResponse = {
  id?: string
}

export async function sendEmail({ html, subject, text, to }: SendEmailInput) {
  const apiKey = resendApiKey()

  if (!apiKey) {
    if (isProductionEnv()) {
      throw new Error('RESEND_API_KEY is required to send email')
    }

    logInfo('email.send.skipped', {
      reason: 'missing_api_key',
      subject,
      to
    })
    return { id: 'dev-email-not-sent' }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: emailFrom(),
      html,
      subject,
      text,
      to
    })
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Resend email failed with ${response.status}: ${body}`)
  }

  return (await response.json()) as ResendSendEmailResponse
}
