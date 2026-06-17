import { NextRequest } from 'next/server'

import { elapsedSince, logAgentRun } from '@/server/agent/run-logger'
import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { jsonErrorMessage } from '@/server/http'

import { createRunEventStream } from './run-event-stream'

type AgentRunEventsContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function handleAgentRunEventsGet(
  request: NextRequest,
  context: AgentRunEventsContext
) {
  const startedAt = Date.now()
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before reading agent run events', 401)
  }

  const { id } = await context.params
  const run = await prisma.agentRun.findFirst({
    where: {
      id,
      userId: user.id
    },
    select: {
      id: true,
      status: true
    }
  })

  if (!run) {
    return jsonErrorMessage('Agent run not found', 404)
  }

  const requestedAfter = Number(request.nextUrl.searchParams.get('after') || '0')
  const afterSeq = Number.isFinite(requestedAfter) ? requestedAfter : 0
  logAgentRun(
    'sse.request.accepted',
    {
      runId: run.id,
      status: run.status,
      userId: user.id
    },
    {
      afterSeq,
      requestElapsedMs: elapsedSince(startedAt)
    }
  )

  return new Response(createRunEventStream(run.id, afterSeq, request.signal), {
    headers: {
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no'
    }
  })
}
