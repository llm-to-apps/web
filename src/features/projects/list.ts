import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { projectMemberWhere } from '@/server/project-members'
import { formatProjectDeployErrorForDisplay } from './deploy-error'
import { createTemplateImageMap, getProjectTemplateUpdate } from './template-update'

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
      templateImage: true,
      slug: true,
      domain: true,
      url: true,
      status: true,
      deletedAt: true,
      deployError: true
    }
  })
  const templates = await prisma.appTemplate.findMany({
    where: {
      id: {
        in: [...new Set(projects.map((project) => project.templateId))]
      }
    },
    select: {
      id: true,
      image: true
    }
  })
  const latestImagesByTemplateId = createTemplateImageMap(templates)

  return jsonOk({
    projects: projects.map((project) => ({
      ...project,
      deployError: formatProjectDeployErrorForDisplay(
        project.deployError,
        project.status
      ),
      templateUpdate: getProjectTemplateUpdate(project, latestImagesByTemplateId)
    }))
  })
}
