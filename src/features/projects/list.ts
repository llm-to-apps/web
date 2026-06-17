import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { projectMemberWhere } from '@/server/project-members'

export async function handleProjectsListGet() {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before viewing applications', 401)
  }

  const projects = await prisma.project.findMany({
    where: {
      members: projectMemberWhere(user.id)
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      templateId: true,
      templateName: true,
      slug: true,
      domain: true,
      url: true,
      status: true,
      deletedAt: true,
      deployError: true
    }
  })

  return jsonOk({
    projects
  })
}
