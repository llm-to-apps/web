import { z } from 'zod'

import { requiredStringSchema } from '@/shared/schema'

export const userAgentChatRequestSchema = z.object({
  attachedFileIds: z.array(z.string().uuid()).max(10).default([]),
  message: requiredStringSchema('Message')
})

export const projectAgentChatRequestSchema = z.object({
  attachedFileIds: z.array(z.string().uuid()).max(10).default([]),
  message: requiredStringSchema('Message'),
  mode: z.enum(['dev', 'use']).catch('use')
})

export type UserAgentChatRequest = z.infer<typeof userAgentChatRequestSchema>
export type ProjectAgentChatRequest = z.infer<typeof projectAgentChatRequestSchema>
