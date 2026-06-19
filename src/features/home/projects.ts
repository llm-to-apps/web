import { prisma } from '@/server/db'
import { projectMemberWhere } from '@/server/project-members'
import { formatCreditsUsed, formatInitialUsage } from '@/shared/usage-format'
import {
  createTemplateImageMap,
  getProjectTemplateUpdate
} from '@/features/projects/template-update'
import type { Locale } from '@/shared/i18n/config'

export async function loadHomeProjects(userId: string, locale: Locale) {
  const projects = await prisma.project.findMany({
    where: {
      members: projectMemberWhere(userId)
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
      image: true,
      translations: {
        where: {
          locale
        },
        select: {
          name: true
        }
      }
    }
  })
  const projectUsageSummaries =
    projects.length > 0
      ? await prisma.creditLedgerEntry.groupBy({
          by: ['projectId'],
          where: {
            actorUserId: userId,
            projectId: {
              in: projects.map((project) => project.id)
            },
            sourceType: 'agent_run'
          },
          _sum: {
            credits: true
          }
        })
      : []
  const usageByProjectId = new Map(
    projectUsageSummaries.map((usage) => [
      usage.projectId,
      formatCreditsUsed(usage._sum.credits)
    ])
  )
  const latestImagesByTemplateId = createTemplateImageMap(templates)
  const localizedTemplateNames = new Map(
    templates.map((template) => [template.id, template.translations[0]?.name ?? null])
  )

  return projects.map((project) => ({
    ...project,
    deletedAt: project.deletedAt?.toISOString() ?? null,
    templateName: localizedTemplateNames.get(project.templateId) ?? project.templateName,
    templateUpdate: getProjectTemplateUpdate(project, latestImagesByTemplateId),
    usage: formatInitialUsage({
      creditsUsed: usageByProjectId.get(project.id) ?? 0
    })
  }))
}
