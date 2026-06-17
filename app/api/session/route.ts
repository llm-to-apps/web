import { NextResponse } from 'next/server';

import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { formatCreditsUsed, formatUsageSummary } from '../../../lib/usage-format';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ ok: false, user: null }, { status: 401 });
  }

  const creditUsageSummary = await prisma.creditLedgerEntry.aggregate({
    where: {
      actorUserId: user.id,
      sourceType: 'agent_run'
    },
    _sum: {
      credits: true
    }
  });

  return NextResponse.json({
    ok: true,
    usageSummary: formatUsageSummary(formatCreditsUsed(creditUsageSummary._sum.credits)),
    user
  });
}
