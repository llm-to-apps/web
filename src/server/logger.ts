import { reportErrorToSentry } from './sentry'

type LogLevel = 'debug' | 'error' | 'info' | 'warn'

export type LogContext = {
  elapsedMs?: number | null
  event?: string
  jobId?: string | number | null
  operation?: string
  projectId?: string | null
  requestId?: string | null
  runId?: string | null
  status?: number | string | null
  userId?: string | null
  [key: string]: unknown
}

const sensitiveKeyPattern =
  /(authorization|cookie|password|secret|token|code|credential|databaseUrl|connectionString)/i

export function logInfo(
  event: string,
  context: LogContext = {},
  details: Record<string, unknown> = {}
) {
  writeLog('info', event, context, details)
}

export function logWarn(
  event: string,
  context: LogContext = {},
  details: Record<string, unknown> = {}
) {
  writeLog('warn', event, context, details)
}

export function logError(
  event: string,
  context: LogContext = {},
  details: Record<string, unknown> = {}
) {
  writeLog('error', event, context, details)
}

export function logDebug(
  event: string,
  context: LogContext = {},
  details: Record<string, unknown> = {}
) {
  writeLog('debug', event, context, details)
}

export function elapsedSince(startedAt: number) {
  return Date.now() - startedAt
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    }

    if ('cause' in error && error.cause) {
      serialized.cause = sanitizeValue(error.cause)
    }

    if (error instanceof AggregateError) {
      serialized.errors = error.errors.map((item) => sanitizeValue(item))
    }

    return serialized
  }

  return sanitizeValue(error)
}

function writeLog(
  level: LogLevel,
  event: string,
  context: LogContext,
  details: Record<string, unknown>
) {
  const payload = sanitizeValue({
    ...context,
    ...details,
    event,
    level,
    timestamp: new Date().toISOString()
  })

  switch (level) {
    case 'debug':
      console.debug('[os7]', payload)
      return
    case 'error':
      console.error('[os7]', payload)
      reportErrorToSentry(event, context, details)
      return
    case 'warn':
      console.warn('[os7]', payload)
      return
    case 'info':
      console.info('[os7]', payload)
  }
}

function sanitizeValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0
): unknown {
  if (value instanceof Error) {
    return serializeError(value)
  }

  if (depth > 6) {
    return '[truncated]'
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeValue(item, seen, depth + 1))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return '[circular]'
  }
  seen.add(value)

  const record = value as Record<string, unknown>
  const sanitized: Record<string, unknown> = {}

  for (const [key, item] of Object.entries(record)) {
    sanitized[key] = sensitiveKeyPattern.test(key)
      ? '[redacted]'
      : sanitizeValue(item, seen, depth + 1)
  }

  seen.delete(value)

  return sanitized
}
