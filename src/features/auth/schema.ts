import { z } from 'zod'

import { requiredStringSchema } from '@/shared/schema'

export const startEmailAuthRequestSchema = z.object({
  email: requiredStringSchema('email')
})

export const verifyEmailAuthRequestSchema = z.object({
  code: requiredStringSchema('code'),
  email: requiredStringSchema('email')
})

export type StartEmailAuthRequest = z.infer<typeof startEmailAuthRequestSchema>
export type VerifyEmailAuthRequest = z.infer<typeof verifyEmailAuthRequestSchema>
