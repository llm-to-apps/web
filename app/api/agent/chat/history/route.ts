import { NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../../lib/auth';
import { userAgentMemoryIds } from '../../../../../lib/agent-memory-ids';
import { deleteMastraMemoryThread } from '../../../../../lib/mastra-memory';
import { prisma } from '../../../../../lib/db';

export async function DELETE() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before clearing chat history' },
      { status: 401 }
    );
  }

  const activeRun = await prisma.agentRun.findFirst({
    where: {
      scope: 'user_agent',
      status: {
        in: ['queued', 'running']
      },
      userId: user.id
    },
    select: {
      id: true
    }
  });

  if (activeRun) {
    return NextResponse.json(
      { ok: false, message: 'Wait until the agent finishes before clearing history' },
      { status: 409 }
    );
  }

  const memoryIds = userAgentMemoryIds(user.id);

  await deleteMastraMemoryThread({
    agentId: 'userAgent',
    ...memoryIds
  });
  await prisma.userAgentChatMessage.deleteMany({
    where: {
      userId: user.id
    }
  });

  return NextResponse.json({ ok: true });
}
