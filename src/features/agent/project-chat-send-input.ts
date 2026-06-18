import { type NextRequest } from 'next/server'

import { parseJsonRequest } from '@/shared/schema'
import { projectAgentChatRequestSchema } from './schema'

export async function parseProjectChatSendInput(request: NextRequest) {
  const body = await parseJsonRequest(request, projectAgentChatRequestSchema)

  return {
    attachedFileIds: body.attachedFileIds,
    message: body.message,
    mode: body.mode
  }
}
