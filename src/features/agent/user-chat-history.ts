import { getCurrentUser } from '@/server/auth'
import { userAgentMemoryIds } from '@/server/agent/memory-ids'
import { deleteMastraMemoryThread } from '@/server/agent/mastra-memory'
import { prisma } from '@/server/db'
import { jsonErrorMessage, jsonOk } from '@/server/http'

export async function handleUserAgentChatHistoryDelete() {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before clearing chat history', 401)
  }

  const activeRun = await prisma.agentRun.findFirst({
    where: {
      scope: 'user_agent',
      status: {
        in: ['queued', 'running']
      },
      userId: user.id
    },
    select: {
      id: true
    }
  })

  if (activeRun) {
    return jsonErrorMessage('Wait until the agent finishes before clearing history', 409)
  }

  const memoryIds = userAgentMemoryIds(user.id)

  await deleteMastraMemoryThread({
    agentId: 'userAgent',
    ...memoryIds
  })
  await prisma.userAgentChatMessage.deleteMany({
    where: {
      userId: user.id
    }
  })

  return jsonOk()
}
