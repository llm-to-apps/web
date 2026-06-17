import { prisma } from '@/server/db'
import { projectMemberWhere } from '@/server/project-members'
import { formatCreditsUsed, formatInitialUsage } from '@/shared/usage-format'

export async function loadHomeProjects(userId: string) {
  const projects = await prisma.project.findMany({
    where: {
      members: projectMemberWhere(userId)
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

  return projects.map((project) => ({
    ...project,
    deletedAt: project.deletedAt?.toISOString() ?? null,
    usage: formatInitialUsage({
      creditsUsed: usageByProjectId.get(project.id) ?? 0
    })
  }))
}
