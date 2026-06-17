import { prisma } from '@/server/db'
import { projectMemberWhere } from '@/server/project-members'

export async function findWorkspaceProject({
  projectIdOrSlug,
  userId
}: {
  projectIdOrSlug: string
  userId: string
}) {
  return prisma.project.findFirst({
    where: {
      OR: [
        {
          id: projectIdOrSlug
        },
        {
          slug: projectIdOrSlug
        }
      ],
      members: projectMemberWhere(userId),
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true,
      templateName: true,
      slug: true,
      domain: true,
      devDomain: true,
      devUrl: true,
      url: true,
      status: true,
      deployError: true
    }
  })
}
