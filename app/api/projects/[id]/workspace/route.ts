import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { projectMemberWhere } from '../../../../../lib/project-members';
import {
  formatCreditsUsed,
  formatInitialUsage,
  formatUsageSummary
} from '../../../../../lib/usage-format';

type ProjectWorkspaceContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(request: NextRequest, context: ProjectWorkspaceContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before viewing applications' },
      { status: 401 }
    );
  }

  if (!user.onboarded) {
    return NextResponse.json(
      { ok: false, message: 'Complete onboarding first' },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const mode = request.nextUrl.searchParams.get('mode') === 'dev' ? 'dev' : 'use';
  const project = await prisma.project.findFirst({
    where: {
      OR: [
        {
          id
        },
        {
          slug: id
        }
      ],
      members: projectMemberWhere(user.id),
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
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, message: 'Application not found' },
      { status: 404 }
    );
  }

  const chatMessages = await prisma.projectAgentChatMessage.findMany({
    where: {
      mode,
      projectId: project.id,
      userId: user.id
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 100,
    select: {
      id: true,
      role: true,
      source: true,
      content: true
    }
  });
  const orderedChatMessages = chatMessages.reverse();
  const activeProjectAgentRun = await prisma.agentRun.findFirst({
    where: {
      projectId: project.id,
      mode,
      scope: 'project_agent',
      status: {
        in: ['queued', 'running']
      },
      userId: user.id
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true
    }
  });
  const chatMessageIds = orderedChatMessages.map((message) => message.id);
  const agentUsages =
    chatMessageIds.length > 0
      ? await prisma.agentUsage.findMany({
          where: {
            assistantMessageId: {
              in: chatMessageIds
            },
            projectId: project.id,
            userId: user.id
          },
          select: {
            assistantMessageId: true,
            requestId: true
          }
        })
      : [];
  const requestIds = agentUsages.map((usage) => usage.requestId);
  const ledgerEntries =
    requestIds.length > 0
      ? await prisma.creditLedgerEntry.findMany({
          where: {
            actorUserId: user.id,
            meterType: 'llm_tokens',
            sourceId: {
              in: requestIds
            },
            sourceType: 'agent_run'
          },
          select: {
            credits: true,
            sourceId: true
          }
        })
      : [];
  const creditsByRequestId = new Map(
    ledgerEntries.map((entry) => [entry.sourceId, formatCreditsUsed(entry.credits)])
  );
  const usageByAssistantMessageId = new Map(
    agentUsages
      .filter((usage) => usage.assistantMessageId)
      .map((usage) => [
        usage.assistantMessageId,
        {
          creditsUsed: creditsByRequestId.get(usage.requestId) ?? 0
        }
      ])
  );
  const creditUsageSummary = await prisma.creditLedgerEntry.aggregate({
    where: {
      actorUserId: user.id,
      projectId: project.id,
      sourceType: 'agent_run'
    },
    _sum: {
      credits: true
    }
  });
  const appUrl = project.url.replace(/\/$/, '');
  const devUrl = (project.devUrl ?? createDevUrl(appUrl)).replace(/\/$/, '');
  const activeAppUrl = mode === 'dev' ? devUrl : appUrl;

  return NextResponse.json({
    ok: true,
    activeRunId: activeProjectAgentRun?.id ?? null,
    appOrigin: new URL(activeAppUrl).origin,
    messages: orderedChatMessages.map((message) => ({
      id: message.id,
      role: message.role === 'user' ? 'user' : 'assistant',
      source: message.source,
      content: message.content,
      usage:
        message.role === 'assistant'
          ? formatInitialUsage(usageByAssistantMessageId.get(message.id))
          : null
    })),
    project: {
      appUrl: project.url,
      deployError: project.deployError,
      devUrl,
      domain: project.domain,
      devDomain: project.devDomain,
      id: project.id,
      name: project.templateName,
      status: project.status,
      toolsUrl: `${appUrl}/agent-tools`
    },
    usageSummary: formatUsageSummary(formatCreditsUsed(creditUsageSummary._sum.credits))
  });
}

function createDevUrl(appUrl: string) {
  const url = new URL(appUrl);
  url.port = '4046';
  url.pathname = '/';
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
}
