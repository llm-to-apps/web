import { readAgentRunEvents, subscribeAgentRunEvents } from '@/server/agent/run-events'
import { elapsedSince, logAgentRun, warnAgentRun } from '@/server/agent/run-logger'

type AgentRunEventRecord = {
  payload: unknown
  seq: number
  type: string
}

const encoder = new TextEncoder()

export function createRunEventStream(
  runId: string,
  initialAfterSeq: number,
  signal: AbortSignal
) {
  const streamStartedAt = Date.now()
  let lastSeq = initialAfterSeq
  let isClosed = false
  let unsubscribe: { close: () => Promise<void> } | null = null
  let poll: ReturnType<typeof setInterval> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let sentEvents = 0

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = async () => {
        if (isClosed) {
          return
        }

        isClosed = true
        if (poll) {
          clearInterval(poll)
        }
        if (heartbeat) {
          clearInterval(heartbeat)
        }
        await unsubscribe?.close()
        logAgentRun(
          'sse.closed',
          {
            runId
          },
          {
            elapsedMs: elapsedSince(streamStartedAt),
            lastSeq,
            sentEvents
          }
        )
        controller.close()
      }
      const send = (event: AgentRunEventRecord) => {
        if (isClosed || event.seq <= lastSeq) {
          return
        }

        lastSeq = event.seq
        sentEvents++
        controller.enqueue(encoder.encode(formatSseEvent(event)))
        logAgentRun(
          'sse.event.sent',
          {
            eventType: event.type,
            runId,
            seq: event.seq
          },
          {
            elapsedMs: elapsedSince(streamStartedAt),
            sentEvents
          }
        )

        if (event.type === 'done' || event.type === 'error') {
          setTimeout(() => {
            close().catch(() => undefined)
          }, 50)
        }
      }

      const flushDbEvents = async () => {
        const events = await readAgentRunEvents(runId, lastSeq)

        for (const event of events) {
          send(event)
        }
      }

      await flushDbEvents()
      unsubscribe = await subscribeAgentRunEvents(runId, send).catch((error) => {
        warnAgentRun(
          'sse.redis_subscribe.failed',
          {
            runId
          },
          {
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        )
        return null
      })
      if (unsubscribe) {
        logAgentRun(
          'sse.redis_subscribed',
          {
            runId
          },
          {
            elapsedMs: elapsedSince(streamStartedAt)
          }
        )
      }

      poll = setInterval(() => {
        flushDbEvents().catch((error) => {
          send({
            payload: {
              type: 'error',
              message:
                error instanceof Error ? error.message : 'Failed to read run events'
            },
            seq: lastSeq + 1,
            type: 'error'
          })
        })
      }, 1_000)
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, 15_000)

      signal.addEventListener('abort', () => {
        logAgentRun(
          'sse.abort',
          {
            runId
          },
          {
            elapsedMs: elapsedSince(streamStartedAt),
            lastSeq,
            sentEvents
          }
        )
        close().catch(() => undefined)
      })
    },
    async cancel() {
      isClosed = true
      if (poll) {
        clearInterval(poll)
      }
      if (heartbeat) {
        clearInterval(heartbeat)
      }
      await unsubscribe?.close()
      logAgentRun(
        'sse.cancel',
        {
          runId
        },
        {
          elapsedMs: elapsedSince(streamStartedAt),
          lastSeq,
          sentEvents
        }
      )
    }
  })
}

function formatSseEvent(event: AgentRunEventRecord) {
  return [
    `id: ${event.seq}`,
    'event: message',
    `data: ${JSON.stringify(event.payload)}`,
    '',
    ''
  ].join('\n')
}
