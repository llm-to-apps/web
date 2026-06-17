type ClientLogContext = Record<string, unknown>

const clientLogEnabled =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_OS7_CLIENT_LOGS === '1'

const sensitiveKeyPattern =
  /(authorization|cookie|password|secret|token|code|credential|state)/i

export function clientInfo(event: string, context: ClientLogContext = {}) {
  writeClientLog('info', event, context)
}

export function clientWarn(event: string, context: ClientLogContext = {}) {
  writeClientLog('warn', event, context)
}

export function clientError(event: string, context: ClientLogContext = {}) {
  writeClientLog('error', event, context)
}

function writeClientLog(
  level: 'error' | 'info' | 'warn',
  event: string,
  context: ClientLogContext
) {
  if (!clientLogEnabled) {
    return
  }

  const payload = {
    ...sanitizeClientContext(context),
    event
  }

  switch (level) {
    case 'error':
      console.error('[os7-client]', payload)
      return
    case 'warn':
      console.warn('[os7-client]', payload)
      return
    case 'info':
      console.info('[os7-client]', payload)
  }
}

function sanitizeClientContext(context: ClientLogContext) {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[redacted]' : value
    ])
  )
}
