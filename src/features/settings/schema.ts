import { z } from 'zod'

import { optionalStringSchema, requiredStringSchema } from '@/shared/schema'

export const profileInputSchema = z.object({
  aiExperienceLevel: optionalStringSchema.optional(),
  name: requiredStringSchema('Name'),
  vibeCodingExperienceLevel: optionalStringSchema.optional()
})

export type ProfileInput = z.infer<typeof profileInputSchema>
