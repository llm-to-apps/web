import { publishRedisMessage, subscribeRedisChannel } from '../integrations/redis-pubsub'

type HomeChangedEvent = {
  type: 'changed'
  userId: string
}

function homeChannel(userId: string) {
  return `home:${userId}`
}

export async function publishHomeChanged(userId: string) {
  const event: HomeChangedEvent = {
    type: 'changed',
    userId
  }

  await publishRedisMessage(homeChannel(userId), JSON.stringify(event))
}

export async function subscribeHomeChanged(
  userId: string,
  onEvent: (event: HomeChangedEvent) => void
) {
  return subscribeRedisChannel(homeChannel(userId), (message) => {
    const event = parseJson(message) as HomeChangedEvent | null

    if (event?.type === 'changed' && event.userId === userId) {
      onEvent(event)
    }
  })
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}
