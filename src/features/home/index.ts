import { getCurrentUser } from '@/server/auth'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { loadHomeProjects } from './projects'
import { loadHomeUserAgentChat } from './user-agent-chat'

export async function handleHomeGet() {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before viewing home', 401)
  }

  if (!user.onboarded) {
    return jsonErrorMessage('Complete onboarding first', 403)
  }

  const [projects, userAgentChat] = await Promise.all([
    loadHomeProjects(user.id),
    loadHomeUserAgentChat(user.id)
  ])

  return jsonOk({
    activeRunId: userAgentChat.activeRunId,
    messages: userAgentChat.messages,
    projects
  })
}
