import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getAgentRunQueue } from '@/lib/agent-run-queue';
import { elapsedSince, logAgentRun } from '@/lib/agent-run-logger';
import { prisma } from '@/lib/db';
import { projectDevAgentModel, projectUseAgentModel } from '@/lib/env';
import { canUseProjectAgent, projectMemberWhere } from '@/lib/project-members';
import { ensureAuthToken } from '@/lib/auth-tokens';
import { publishProjectChatChanged } from '@/lib/project-chat-events';

type AgentChatContext = {
  params: Promise<{ id: string }> | { id: string };
};

type AgentChatRequest = {
  message?: string;
  mode?: 'use' | 'dev';
};

export async function GET(request: NextRequest, context: AgentChatContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before reading the agent chat' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const mode = request.nextUrl.searchParams.get('mode') === 'dev' ? 'dev' : 'use';
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id,
      members: projectMemberWhere(user.id),
      status: {
        notIn: ['deleting', 'deleted']
      }
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

  const [chatMessages, activeRun] = await Promise.all([
    prisma.projectAgentChatMessage.findMany({
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
        content: true,
        id: true,
        role: true,
        source: true
      }
    }),
    prisma.agentRun.findFirst({
      where: {
        mode,
        projectId: project.id,
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
    })
  ]);
  const orderedMessages = chatMessages.reverse();
  const messageIds = orderedMessages.map((message) => message.id);
  const agentUsages =
    messageIds.length > 0
      ? await prisma.agentUsage.findMany({
          where: {
            assistantMessageId: {
              in: messageIds
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

  return NextResponse.json({
    activeRunId: activeRun?.id ?? null,
    messages: orderedMessages.map((message) => ({
      content: message.content,
      id: message.id,
      role: message.role === 'user' ? 'user' : 'assistant',
      source: message.source,
      usage:
        message.role === 'assistant'
          ? formatInitialUsage(usageByAssistantMessageId.get(message.id))
          : null
    })),
    ok: true
  });
}

export async function POST(request: NextRequest, context: AgentChatContext) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before chatting with the agent' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const body = (await request.json()) as AgentChatRequest;
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json(
      { ok: false, message: 'Message is required' },
      { status: 400 }
    );
  }
  logAgentRun('api.chat.received', {
    projectId: id,
    requestId,
    scope: 'project_agent',
    userId: user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    messageLength: message.length
  });

  const mode = body.mode === 'dev' ? 'dev' : 'use';
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id,
      members: projectMemberWhere(user.id),
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      agentToolsToken: true,
      domain: true,
      id: true,
      members: {
        where: {
          userId: user.id
        },
        select: {
          role: true
        },
        take: 1
      },
      status: true,
      templateName: true,
      url: true
    }
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, message: 'Application not found' },
      { status: 404 }
    );
  }

  const memberRole = project.members[0]?.role;

  if (!memberRole || !canUseProjectAgent(memberRole, mode)) {
    return NextResponse.json(
      { ok: false, message: 'You do not have permission to use this project agent' },
      { status: 403 }
    );
  }

  const activeRun = await prisma.agentRun.findFirst({
    where: {
      mode,
      projectId: project.id,
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

  if (activeRun) {
    logAgentRun('api.chat.active_run', {
      projectId: project.id,
      requestId,
      runId: activeRun.id,
      scope: 'project_agent',
      userId: user.id
    }, {
      elapsedMs: elapsedSince(startedAt)
    });
    return NextResponse.json({
      active: true,
      ok: true,
      runId: activeRun.id
    });
  }

  const appUrl = project.url.replace(/\/$/, '');
  const runModel = mode === 'dev' ? projectDevAgentModel() : projectUseAgentModel();
  const projectUserToken =
    mode === 'use'
      ? await ensureAuthToken({
          name: `${project.templateName} MCP`,
          projectId: project.id,
          scope: 'project:mcp',
          subjectType: 'user',
          userId: user.id
        })
      : null;
  const userMessage = await prisma.projectAgentChatMessage.create({
    data: {
      content: message,
      mode,
      projectId: project.id,
      role: 'user',
      source: 'user',
      userId: user.id
    }
  });
  notifyProjectChatChanged(user.id, project.id);
  const run = await prisma.agentRun.create({
    data: {
      inputMessageId: userMessage.id,
      mode,
      model: runModel,
      payload: {
        agentToolsToken: project.agentToolsToken,
        appMcpUrl: `${appUrl}/api/mcp`,
        domain: project.domain,
        message,
        projectUserToken: projectUserToken?.token ?? null,
        projectName: project.templateName,
        status: project.status,
        toolsUrl: `${appUrl}/agent-tools`
      },
      projectId: project.id,
      requestId,
      scope: 'project_agent',
      status: 'queued',
      userId: user.id
    },
    select: {
      id: true
    }
  });
  logAgentRun('api.chat.run_created', {
    projectId: project.id,
    requestId,
    runId: run.id,
    scope: 'project_agent',
    userId: user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    model: runModel,
    mode,
    userMessageId: userMessage.id
  });

  await getAgentRunQueue().add(
    'run-agent',
    {
      runId: run.id
    },
    {
      jobId: run.id
    }
  );
  logAgentRun('api.chat.job_enqueued', {
    projectId: project.id,
    requestId,
    runId: run.id,
    scope: 'project_agent',
    userId: user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    mode
  });

  return NextResponse.json({
    ok: true,
    runId: run.id,
    userMessageId: userMessage.id
  });
}

function formatInitialUsage(
  usage:
    | {
        creditsUsed: number;
      }
    | null
    | undefined
) {
  if (!usage || usage.creditsUsed <= 0) {
    return null;
  }

  return {
    creditsUsed: usage.creditsUsed
  };
}

function formatCreditsUsed(value: unknown) {
  const numericValue = Number(value ?? 0);
  return Math.ceil(Math.abs(Math.min(numericValue, 0)));
}

function notifyProjectChatChanged(userId: string, projectId: string) {
  publishProjectChatChanged(userId, projectId).catch(() => undefined);
}
