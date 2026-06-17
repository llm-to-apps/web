import { z } from 'zod'

import { optionalStringSchema } from '@/shared/schema'

export const createPersonalMcpTokenRequestSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    name: optionalStringSchema.optional()
  })
)

export type CreatePersonalMcpTokenRequest = z.infer<
  typeof createPersonalMcpTokenRequestSchema
>
