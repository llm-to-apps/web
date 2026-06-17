import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { loadHomeProjects } from './projects'
import { loadHomeUserAgentChat } from './user-agent-chat'

export async function handleHomeGet() {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before viewing home' },
      { status: 401 }
    )
  }

  if (!user.onboarded) {
    return NextResponse.json(
      { ok: false, message: 'Complete onboarding first' },
      { status: 403 }
    )
  }

  const [projects, userAgentChat] = await Promise.all([
    loadHomeProjects(user.id),
    loadHomeUserAgentChat(user.id)
  ])

  return NextResponse.json({
    ok: true,
    activeRunId: userAgentChat.activeRunId,
    messages: userAgentChat.messages,
    projects
  })
}
