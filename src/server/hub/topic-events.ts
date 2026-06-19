import {
  publishRedisMessage,
  subscribeRedisChannel
} from '@/server/integrations/redis-pubsub'

export type HubArtifactChangedEvent = {
  artifactId: string
  status: string
  topicId: string
  type: 'artifact_changed'
}

export type HubTopicChangedEvent = {
  status: string
  topicId: string
  type: 'topic_changed'
}

export type HubTopicEvent = HubArtifactChangedEvent | HubTopicChangedEvent

export function hubTopicChannel(topicId: string) {
  return `hub_topic:${topicId}`
}

export async function publishHubTopicEvent(event: HubTopicEvent) {
  await publishRedisMessage(hubTopicChannel(event.topicId), JSON.stringify(event))
}

export async function publishHubArtifactChanged(event: HubArtifactChangedEvent) {
  await publishHubTopicEvent(event)
}

export async function publishHubTopicChanged(event: HubTopicChangedEvent) {
  await publishHubTopicEvent(event)
}

export async function subscribeHubTopicEvents(
  topicId: string,
  onEvent: (event: HubTopicEvent) => void
) {
  return subscribeRedisChannel(hubTopicChannel(topicId), (message) => {
    const event = parseJson(message) as HubTopicEvent | null

    if (event?.type === 'artifact_changed' || event?.type === 'topic_changed') {
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
