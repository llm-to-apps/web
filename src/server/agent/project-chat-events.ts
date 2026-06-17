import { publishRedisMessage, subscribeRedisChannel } from '../integrations/redis-pubsub'

type ProjectChatChangedEvent = {
  projectId: string
  type: 'changed'
  userId: string
}

function projectChatChannel(userId: string, projectId: string) {
  return `project_chat:${userId}:${projectId}`
}

export async function publishProjectChatChanged(userId: string, projectId: string) {
  const event: ProjectChatChangedEvent = {
    projectId,
    type: 'changed',
    userId
  }

  await publishRedisMessage(projectChatChannel(userId, projectId), JSON.stringify(event))
}

export async function subscribeProjectChatChanged(
  userId: string,
  projectId: string,
  onEvent: (event: ProjectChatChangedEvent) => void
) {
  return subscribeRedisChannel(projectChatChannel(userId, projectId), (message) => {
    const event = parseJson(message) as ProjectChatChangedEvent | null

    if (
      event?.type === 'changed' &&
      event.projectId === projectId &&
      event.userId === userId
    ) {
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
