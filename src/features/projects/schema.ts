import { z } from 'zod'

const optionalSlugSchema = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value.trim() : undefined))

export const deployProjectRequestSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    slug: optionalSlugSchema.optional(),
    templateId: optionalSlugSchema.optional()
  })
)

export type DeployProjectRequest = z.infer<typeof deployProjectRequestSchema>
