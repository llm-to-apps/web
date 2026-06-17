import { publishProjectChatChanged } from '@/server/agent/project-chat-events'

export type AgentChatContext = {
  params: Promise<{ id: string }> | { id: string }
}

export type AgentChatRequest = {
  message?: string
  mode?: 'use' | 'dev'
}

export function formatInitialUsage(
  usage:
    | {
        creditsUsed: number
      }
    | null
    | undefined
) {
  if (!usage || usage.creditsUsed <= 0) {
    return null
  }

  return {
    creditsUsed: usage.creditsUsed
  }
}

export function formatCreditsUsed(value: unknown) {
  const numericValue = Number(value ?? 0)
  return Math.ceil(Math.abs(Math.min(numericValue, 0)))
}

export function notifyProjectChatChanged(userId: string, projectId: string) {
  publishProjectChatChanged(userId, projectId).catch(() => undefined)
}
