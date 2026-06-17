import { type NextRequest } from 'next/server'

import { type AgentChatRequest } from './project-chat-shared'

export async function parseProjectChatSendInput(request: NextRequest) {
  const body = (await request.json()) as AgentChatRequest
  const message = body.message?.trim() ?? ''
  const mode: 'dev' | 'use' = body.mode === 'dev' ? 'dev' : 'use'

  return {
    message,
    mode
  }
}
