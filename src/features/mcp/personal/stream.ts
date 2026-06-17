import { elapsedSince, logAgentRun } from '@/server/agent/run-logger'

import { type TokenUsage } from './schema'
import { extractTokenUsage, mergeTokenUsage } from './stream-usage'

export async function collectMastraStream(
  body: ReadableStream<Uint8Array>,
  logContext: {
    parentStartedAt: number
    projectId: string
    requestId: string
    userId: string
  }
) {
  const startedAt = Date.now()
  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''
  let content = ''
  let error = ''
  let usage: TokenUsage = {}
  let chunkCount = 0
  let eventCount = 0
  let firstChunkAt: number | null = null
  let firstTextAt: number | null = null
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      chunkCount++
      totalBytes += value.byteLength
      if (!firstChunkAt) {
        firstChunkAt = Date.now()
        logAgentRun(
          'mcp.personal.ask_app_agent.stream.first_chunk',
          {
            projectId: logContext.projectId,
            requestId: logContext.requestId,
            userId: logContext.userId
          },
          {
            bytes: value.byteLength,
            collectElapsedMs: firstChunkAt - startedAt,
            elapsedMs: firstChunkAt - logContext.parentStartedAt
          }
        )
      }

      buffer += decoder.decode(value, { stream: true })
      buffer = flushSseBuffer(buffer, (chunk) => {
        eventCount++
        const text = extractStreamText(chunk)

        if (text) {
          content += text
          if (!firstTextAt) {
            firstTextAt = Date.now()
            logAgentRun(
              'mcp.personal.ask_app_agent.stream.first_text',
              {
                projectId: logContext.projectId,
                requestId: logContext.requestId,
                userId: logContext.userId
              },
              {
                collectElapsedMs: firstTextAt - startedAt,
                elapsedMs: firstTextAt - logContext.parentStartedAt,
                eventCount
              }
            )
          }
        }

        if (isObjectRecord(chunk) && chunk.type === 'error') {
          error += error ? `\n${extractErrorMessage(chunk)}` : extractErrorMessage(chunk)
        }

        usage = mergeTokenUsage(usage, extractTokenUsage(chunk))
      })
    }

    buffer += decoder.decode()
    flushSseBuffer(`${buffer}\n\n`, (chunk) => {
      eventCount++
      const text = extractStreamText(chunk)

      if (text) {
        content += text
        if (!firstTextAt) {
          firstTextAt = Date.now()
          logAgentRun(
            'mcp.personal.ask_app_agent.stream.first_text',
            {
              projectId: logContext.projectId,
              requestId: logContext.requestId,
              userId: logContext.userId
            },
            {
              collectElapsedMs: firstTextAt - startedAt,
              elapsedMs: firstTextAt - logContext.parentStartedAt,
              eventCount
            }
          )
        }
      }

      if (isObjectRecord(chunk) && chunk.type === 'error') {
        error += error ? `\n${extractErrorMessage(chunk)}` : extractErrorMessage(chunk)
      }

      usage = mergeTokenUsage(usage, extractTokenUsage(chunk))
    })
  } finally {
    reader.releaseLock()
  }

  logAgentRun(
    'mcp.personal.ask_app_agent.stream.finished',
    {
      projectId: logContext.projectId,
      requestId: logContext.requestId,
      userId: logContext.userId
    },
    {
      chunkCount,
      collectElapsedMs: elapsedSince(startedAt),
      contentLength: content.trim().length,
      elapsedMs: elapsedSince(logContext.parentStartedAt),
      errorLength: error.trim().length,
      eventCount,
      firstChunkElapsedMs: firstChunkAt ? firstChunkAt - startedAt : null,
      firstTextElapsedMs: firstTextAt ? firstTextAt - startedAt : null,
      totalBytes
    }
  )

  return {
    content,
    error,
    usage
  }
}

function flushSseBuffer(buffer: string, handleChunk: (chunk: unknown) => void) {
  const parts = buffer.split(/\r?\n\r?\n/)
  const remainder = parts.pop() ?? ''

  for (const part of parts) {
    const data = part
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')

    if (!data || data === '[DONE]') {
      continue
    }

    handleChunk(parseJson(data) ?? data)
  }

  return remainder
}

function extractStreamText(chunk: unknown) {
  if (typeof chunk === 'string') {
    return chunk
  }

  if (!isObjectRecord(chunk)) {
    return ''
  }

  for (const key of ['textDelta', 'delta', 'text']) {
    const value = chunk[key]

    if (typeof value === 'string' && value) {
      return value
    }
  }

  const payload = chunk.payload

  if (isObjectRecord(payload)) {
    for (const key of ['textDelta', 'delta', 'text']) {
      const value = payload[key]

      if (typeof value === 'string' && value) {
        return value
      }
    }
  }

  return ''
}

function extractErrorMessage(chunk: Record<string, unknown>) {
  const error = chunk.error

  if (typeof error === 'string') {
    return error
  }

  if (isObjectRecord(error) && typeof error.message === 'string') {
    return error.message
  }

  return 'Agent stream returned an error.'
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
