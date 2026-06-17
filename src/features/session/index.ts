import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { formatCreditsUsed, formatUsageSummary } from '@/shared/usage-format'

export async function handleSessionGet() {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in required', 401)
  }

  const creditUsageSummary = await prisma.creditLedgerEntry.aggregate({
    where: {
      actorUserId: user.id,
      sourceType: 'agent_run'
    },
    _sum: {
      credits: true
    }
  })

  return jsonOk({
    usageSummary: formatUsageSummary(formatCreditsUsed(creditUsageSummary._sum.credits)),
    user
  })
}
