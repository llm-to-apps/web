import { prisma } from '@/server/db'
import { formatCreditsUsed, formatUsageSummary } from '@/shared/usage-format'

export async function loadWorkspaceUsageSummary({
  projectId,
  userId
}: {
  projectId: string
  userId: string
}) {
  const creditUsageSummary = await prisma.creditLedgerEntry.aggregate({
    where: {
      actorUserId: userId,
      projectId,
      sourceType: 'agent_run'
    },
    _sum: {
      credits: true
    }
  })

  return formatUsageSummary(formatCreditsUsed(creditUsageSummary._sum.credits))
}
