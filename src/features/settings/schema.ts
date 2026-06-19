import { z } from 'zod'

import { optionalStringSchema, requiredStringSchema } from '@/shared/schema'
import { normalizeUsername, usernameValidationMessage } from '@/server/auth/username'

const usernameSchema = optionalStringSchema.transform((value, ctx) => {
  if (value === null) {
    return null
  }

  const username = normalizeUsername(value)
  const error = usernameValidationMessage(username)

  if (error) {
    ctx.addIssue({
      code: 'custom',
      message: error
    })

    return z.NEVER
  }

  return username
})

export const profileInputSchema = z.object({
  aiExperienceLevel: optionalStringSchema.optional(),
  name: requiredStringSchema('Name'),
  username: usernameSchema.optional(),
  vibeCodingExperienceLevel: optionalStringSchema.optional()
})

export type ProfileInput = z.infer<typeof profileInputSchema>
