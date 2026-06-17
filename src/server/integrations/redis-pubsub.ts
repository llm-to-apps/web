import Redis from 'ioredis'
import { redisPubSubUrl } from '../env'

export type RedisSubscription = {
  close: () => Promise<void>
}

const redisPubSubConnectionUrl = redisPubSubUrl()

let publisher: Redis | null = null

export async function publishRedisMessage(channel: string, message: string) {
  const client = getPublisher()

  await client.publish(channel, message)
}

export async function subscribeRedisChannel(
  channel: string,
  onMessage: (message: string) => void
): Promise<RedisSubscription> {
  const subscriber = createRedisClient()

  subscriber.on('message', (incomingChannel: string, message: string) => {
    if (incomingChannel === channel) {
      onMessage(message)
    }
  })

  await subscriber.subscribe(channel)

  return {
    close: async () => {
      await subscriber.unsubscribe(channel).catch(() => undefined)
      await subscriber.quit().catch(() => {
        subscriber.disconnect()
      })
    }
  }
}

function getPublisher() {
  publisher ??= createRedisClient()
  return publisher
}

function createRedisClient() {
  return new Redis(redisPubSubConnectionUrl, {
    maxRetriesPerRequest: null
  })
}
