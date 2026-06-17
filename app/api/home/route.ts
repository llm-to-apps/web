import { NextResponse } from 'next/server';

import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { projectMemberWhere } from '../../../lib/project-members';
import { formatCreditsUsed, formatInitialUsage } from '../../../lib/usage-format';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before viewing home' },
      { status: 401 }
    );
  }

  if (!user.onboarded) {
    return NextResponse.json(
      { ok: false, message: 'Complete onboarding first' },
      { status: 403 }
    );
  }

  const deletedProjectVisibleAfter = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const projects = await prisma.project.findMany({
    where: {
      members: projectMemberWhere(user.id),
      OR: [
        {
          deletedAt: null,
          status: {
            notIn: ['deleting', 'deleted']
          }
        },
        {
          deletedAt: {
            gte: deletedProjectVisibleAfter
          },
          status: 'deleted'
        }
      ]
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
  });
  const userAgentMessages = await prisma.userAgentChatMessage.findMany({
    where: {
      userId: user.id
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 50,
    select: {
      id: true,
      role: true,
      content: true
    }
  });
  const orderedUserAgentMessages = userAgentMessages
    .reverse()
    .filter((message) => message.role === 'assistant' || message.role === 'user');
  const activeUserAgentRun = await prisma.agentRun.findFirst({
    where: {
      scope: 'user_agent',
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
  const userAgentAssistantMessageIds = orderedUserAgentMessages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.id);
  const userAgentUsages =
    userAgentAssistantMessageIds.length > 0
      ? await prisma.agentUsage.findMany({
          where: {
            assistantMessageId: {
              in: userAgentAssistantMessageIds
            },
            projectId: null,
            userId: user.id
          },
          select: {
            assistantMessageId: true,
            requestId: true
          }
        })
      : [];
  const userAgentRequestIds = userAgentUsages.map((usage) => usage.requestId);
  const userAgentLedgerEntries =
    userAgentRequestIds.length > 0
      ? await prisma.creditLedgerEntry.findMany({
          where: {
            actorUserId: user.id,
            meterType: 'llm_tokens',
            sourceId: {
              in: userAgentRequestIds
            },
            sourceType: 'agent_run'
          },
          select: {
            credits: true,
            sourceId: true
          }
        })
      : [];
  const userAgentCreditsByRequestId = new Map(
    userAgentLedgerEntries.map((entry) => [entry.sourceId, formatCreditsUsed(entry.credits)])
  );
  const userAgentUsageByAssistantMessageId = new Map(
    userAgentUsages
      .filter((usage) => usage.assistantMessageId)
      .map((usage) => [
        usage.assistantMessageId,
        {
          creditsUsed: userAgentCreditsByRequestId.get(usage.requestId) ?? 0
        }
      ])
  );
  const projectUsageSummaries =
    projects.length > 0
      ? await prisma.creditLedgerEntry.groupBy({
          by: ['projectId'],
          where: {
            actorUserId: user.id,
            projectId: {
              in: projects.map((project) => project.id)
            },
            sourceType: 'agent_run'
          },
          _sum: {
            credits: true
          }
        })
      : [];
  const usageByProjectId = new Map(
    projectUsageSummaries.map((usage) => [
      usage.projectId,
      formatCreditsUsed(usage._sum.credits)
    ])
  );

  return NextResponse.json({
    ok: true,
    activeRunId: activeUserAgentRun?.id ?? null,
    messages: orderedUserAgentMessages.map((message) => ({
      id: message.id,
      role: message.role as 'assistant' | 'user',
      content: message.content,
      usage:
        message.role === 'assistant'
          ? formatInitialUsage(userAgentUsageByAssistantMessageId.get(message.id))
          : null
    })),
    projects: projects.map((project) => ({
      ...project,
      deletedAt: project.deletedAt?.toISOString() ?? null,
      usage: formatInitialUsage({
        creditsUsed: usageByProjectId.get(project.id) ?? 0
      })
    }))
  });
}
