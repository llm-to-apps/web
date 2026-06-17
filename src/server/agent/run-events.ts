import { prisma } from '../db'
import { type AgentStreamEvent } from './run-types'
import { publishRedisMessage, subscribeRedisChannel } from '../integrations/redis-pubsub'
import { elapsedSince, logAgentRun, warnAgentRun } from './run-logger'

type AgentRunEventRecord = {
  seq: number
  type: string
  payload: unknown
}

export function agentRunChannel(runId: string) {
  return `agent_run:${runId}`
}

export async function recordAgentRunEvent(runId: string, event: AgentStreamEvent) {
  const startedAt = Date.now()
  const createdEvent = await prisma.$transaction(async (tx) => {
    const lastEvent = await tx.agentRunEvent.findFirst({
      where: { runId },
      orderBy: { seq: 'desc' },
      select: { seq: true }
    })

    return tx.agentRunEvent.create({
      data: {
        runId,
        seq: (lastEvent?.seq ?? 0) + 1,
        type: event.type,
        payload: event
      },
      select: {
        payload: true,
        seq: true,
        type: true
      }
    })
  })
  logAgentRun(
    'event.recorded',
    {
      eventType: event.type,
      runId,
      seq: createdEvent.seq
    },
    {
      dbElapsedMs: elapsedSince(startedAt)
    }
  )

  const publishStartedAt = Date.now()
  await publishAgentRunEvent(runId, createdEvent).catch((error) => {
    warnAgentRun(
      'event.publish.failed',
      {
        eventType: event.type,
        runId,
        seq: createdEvent.seq
      },
      {
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    )
  })
  logAgentRun(
    'event.publish.finished',
    {
      eventType: event.type,
      runId,
      seq: createdEvent.seq
    },
    {
      publishElapsedMs: elapsedSince(publishStartedAt)
    }
  )

  return createdEvent
}

export async function readAgentRunEvents(runId: string, afterSeq = 0) {
  const startedAt = Date.now()
  const events = await prisma.agentRunEvent.findMany({
    where: {
      runId,
      seq: {
        gt: afterSeq
      }
    },
    orderBy: {
      seq: 'asc'
    },
    select: {
      payload: true,
      seq: true,
      type: true
    }
  })
  logAgentRun(
    'event.read_db',
    {
      runId
    },
    {
      afterSeq,
      count: events.length,
      dbElapsedMs: elapsedSince(startedAt),
      lastSeq: events.at(-1)?.seq ?? afterSeq
    }
  )

  return events
}

export async function subscribeAgentRunEvents(
  runId: string,
  onEvent: (event: AgentRunEventRecord) => void
) {
  const startedAt = Date.now()
  logAgentRun('event.subscribe.started', {
    runId
  })
  return subscribeRedisChannel(agentRunChannel(runId), (message) => {
    const parsed = parseJson(message) as AgentRunEventRecord | null

    if (parsed) {
      logAgentRun(
        'event.subscribe.message',
        {
          eventType: parsed.type,
          runId,
          seq: parsed.seq
        },
        {
          subscribeElapsedMs: elapsedSince(startedAt)
        }
      )
      onEvent(parsed)
    }
  })
}

async function publishAgentRunEvent(runId: string, event: AgentRunEventRecord) {
  await publishRedisMessage(agentRunChannel(runId), JSON.stringify(event))
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}
