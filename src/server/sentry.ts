type SentrySdk = typeof import('@sentry/nextjs')

type SentryContext = Record<string, unknown>

const sensitiveKeyPattern =
  /(authorization|cookie|password|secret|token|code|credential|databaseUrl|connectionString|state)/i

let sentrySdkPromise: Promise<SentrySdk | null> | null = null

export function reportErrorToSentry(
  event: string,
  context: SentryContext,
  details: SentryContext
) {
  const error = details.error

  if (!error) {
    return
  }

  void getSentrySdk().then((sentry) => {
    if (!sentry) {
      return
    }

    sentry.withScope((scope) => {
      scope.setTag('event', event)

      for (const [key, value] of Object.entries(context)) {
        if (typeof value === 'string' || typeof value === 'number') {
          scope.setTag(key, String(value))
        }
      }

      scope.setContext('log', {
        context: sanitizeForSentry(context),
        details: sanitizeForSentry(withoutError(details))
      })

      sentry.captureException(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

function getSentrySdk() {
  const dsn = process.env.SENTRY_DSN

  if (!dsn) {
    return Promise.resolve(null)
  }

  sentrySdkPromise ??= import('@sentry/nextjs')
    .then((sentry) => {
      if (!sentry.getClient()) {
        sentry.init({
          dsn,
          environment:
            process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
          release: process.env.SENTRY_RELEASE
        })
      }

      return sentry
    })
    .catch(() => null)

  return sentrySdkPromise
}

function withoutError(record: SentryContext) {
  const rest = { ...record }
  delete rest.error

  return rest
}

function sanitizeForSentry(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0
): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name
    }
  }

  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value
  }

  if (depth > 4) {
    return '[truncated]'
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeForSentry(item, seen, depth + 1))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return '[circular]'
  }
  seen.add(value)

  const sanitized: Record<string, unknown> = {}

  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = sensitiveKeyPattern.test(key)
      ? '[redacted]'
      : sanitizeForSentry(item, seen, depth + 1)
  }

  seen.delete(value)

  return sanitized
}
