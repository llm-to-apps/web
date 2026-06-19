import { cookies } from 'next/headers'

import { getCurrentUser } from '@/server/auth'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { defaultLocale, isLocale, localeCookieName } from '@/shared/i18n/config'
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

  const locale = await currentLocale()
  const [projects, userAgentChat] = await Promise.all([
    loadHomeProjects(user.id, locale),
    loadHomeUserAgentChat(user.id)
  ])

  return jsonOk({
    activeRunId: userAgentChat.activeRunId,
    messages: userAgentChat.messages,
    projects
  })
}

async function currentLocale() {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(localeCookieName)?.value

  return isLocale(cookieLocale) ? cookieLocale : defaultLocale
}
