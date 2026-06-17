import {
  elapsedSince,
  logError,
  logInfo,
  logWarn,
  type LogContext
} from '@/server/logger'

export { elapsedSince }

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
} & LogContext

export function logAgentRun(
  marker: string,
  context: AgentRunLogContext = {},
  details: Record<string, unknown> = {}
) {
  logInfo(`agent_run.${marker}`, context, details)
}

export function warnAgentRun(
  marker: string,
  context: AgentRunLogContext = {},
  details: Record<string, unknown> = {}
) {
  logWarn(`agent_run.${marker}`, context, details)
}

export function errorAgentRun(
  marker: string,
  context: AgentRunLogContext = {},
  details: Record<string, unknown> = {}
) {
  logError(`agent_run.${marker}`, context, details)
}

export function truncateForLog(value: string, maxLength = 180) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}
