import { type ProjectMemberRole } from '@prisma/client'

export type ProjectAgentMode = 'dev' | 'use'

export type ProjectAgentChatProject = {
  agentToolsToken: string | null
  domain: string
  id: string
  members: Array<{
    role: ProjectMemberRole
  }>
  status: string
  templateName: string
  url: string
}
