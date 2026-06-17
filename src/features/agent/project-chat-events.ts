import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { projectMemberWhere } from '@/server/project-members'
import { subscribeProjectChatChanged } from '@/server/agent/project-chat-events'

type ProjectAgentChatEventsContext = {
  params: Promise<{ id: string }> | { id: string }
}

const encoder = new TextEncoder()

export async function handleProjectAgentChatEventsGet(
  request: NextRequest,
  context: ProjectAgentChatEventsContext
) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before reading project chat events' },
      { status: 401 }
    )
  }

  const { id } = await context.params
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id,
      members: projectMemberWhere(user.id),
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true
    }
  })

  if (!project) {
    return NextResponse.json(
      { ok: false, message: 'Application not found' },
      { status: 404 }
    )
  }

  return new Response(createProjectChatEventStream(user.id, project.id, request.signal), {
    headers: {
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no'
    }
  })
}

function createProjectChatEventStream(
  userId: string,
  projectId: string,
  signal: AbortSignal
) {
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

        controller.enqueue(encoder.encode('event: chat_changed\ndata: {}\n\n'))
      }

      unsubscribe = await subscribeProjectChatChanged(userId, projectId, sendChanged)
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
