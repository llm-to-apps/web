export type AgentRunLogContext = {
  eventType?: string
  jobId?: string | number
  model?: string
  projectId?: string | null
  requestId?: string
  runId?: string
  scope?: string
  seq?: number
  status?: string
  userId?: string
}

export function logAgentRun(
  marker: string,
  context: AgentRunLogContext = {},
  details: Record<string, unknown> = {}
) {
  console.info('[agent-run]', {
    marker,
    ...context,
    ...details
  })
}

export function warnAgentRun(
  marker: string,
  context: AgentRunLogContext = {},
  details: Record<string, unknown> = {}
) {
  console.warn('[agent-run]', {
    marker,
    ...context,
    ...details
  })
}

export function errorAgentRun(
  marker: string,
  context: AgentRunLogContext = {},
  details: Record<string, unknown> = {}
) {
  console.error('[agent-run]', {
    marker,
    ...context,
    ...details
  })
}

export function elapsedSince(startedAt: number) {
  return Date.now() - startedAt
}

export function truncateForLog(value: string, maxLength = 180) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}
