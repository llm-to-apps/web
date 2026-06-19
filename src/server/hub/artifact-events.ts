import { publishRedisMessage, subscribeRedisChannel } from '@/server/integrations/redis-pubsub'

export type HubArtifactChangedEvent = {
  artifactId: string
  status: string
  topicId: string
  type: 'artifact_changed'
}

export function hubTopicChannel(topicId: string) {
  return `hub_topic:${topicId}`
}

export async function publishHubArtifactChanged(event: HubArtifactChangedEvent) {
  await publishRedisMessage(hubTopicChannel(event.topicId), JSON.stringify(event))
}

export async function subscribeHubTopicEvents(
  topicId: string,
  onEvent: (event: HubArtifactChangedEvent) => void
) {
  return subscribeRedisChannel(hubTopicChannel(topicId), (message) => {
    const event = parseJson(message) as HubArtifactChangedEvent | null

    if (event?.type === 'artifact_changed') {
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
