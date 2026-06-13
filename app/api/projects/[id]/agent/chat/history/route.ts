import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { projectAgentMemoryIds } from '@/lib/agent-memory-ids';
import { deleteMastraMemoryThread } from '@/lib/mastra-memory';
import { prisma } from '@/lib/db';
import { projectMemberWhere } from '@/lib/project-members';
import { publishProjectChatChanged } from '@/lib/project-chat-events';

type ProjectAgentChatHistoryContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function DELETE(request: NextRequest, context: ProjectAgentChatHistoryContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before clearing chat history' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const mode = request.nextUrl.searchParams.get('mode') === 'dev' ? 'dev' : 'use';
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id,
      members: projectMemberWhere(user.id, 'edit')
    },
    select: {
      id: true
    }
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, message: 'Application not found' },
      { status: 404 }
    );
  }

  const activeRun = await prisma.agentRun.findFirst({
    where: {
      projectId: project.id,
      mode,
      scope: 'project_agent',
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

  const memoryIds = projectAgentMemoryIds(user.id, project.id, mode);

  await deleteMastraMemoryThread({
    agentId: mode === 'dev' ? 'projectDevAgent' : 'projectUseAgent',
    ...memoryIds
  });
  await prisma.projectAgentChatMessage.deleteMany({
    where: {
      mode,
      projectId: project.id,
      userId: user.id
    }
  });
  publishProjectChatChanged(user.id, project.id).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
