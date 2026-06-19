import { type NextRequest } from 'next/server'

import { subscribeHomeChanged } from '@/server/agent/home-events'
import { getCurrentUser } from '@/server/auth'
import { jsonErrorMessage } from '@/server/http'

const encoder = new TextEncoder()

export async function handleHomeEventsGet(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before reading home events', 401)
  }

  if (!user.onboarded) {
    return jsonErrorMessage('Complete onboarding first', 403)
  }

  return new Response(createHomeEventStream(user.id, request.signal), {
    headers: {
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no'
    }
  })
}

function createHomeEventStream(userId: string, signal: AbortSignal) {
  let isClosed = false
  let unsubscribe: { close: () => Promise<void> } | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = async () => {
        if (isClosed) {
          return
        }

        isClosed = true
        if (heartbeat) {
          clearInterval(heartbeat)
        }
        await unsubscribe?.close()
        controller.close()
      }

      const sendChanged = () => {
        if (isClosed) {
          return
        }

        controller.enqueue(encoder.encode('event: home_changed\ndata: {}\n\n'))
      }

      unsubscribe = await subscribeHomeChanged(userId, sendChanged)
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, 15_000)
      signal.addEventListener('abort', () => {
        close().catch(() => undefined)
      })
    },
    async cancel() {
      isClosed = true
      if (heartbeat) {
        clearInterval(heartbeat)
      }
      await unsubscribe?.close()
    }
  })
}
