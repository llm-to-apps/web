import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { userAgentModel } from '@/lib/env';
import { getAgentRunQueue } from '@/lib/agent-run-queue';
import { elapsedSince, logAgentRun } from '@/lib/agent-run-logger';
import { platformBaseUrl } from '@/lib/request-origin';

type UserAgentChatRequest = {
  message?: string;
};

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before chatting with the agent' },
      { status: 401 }
    );
  }

  const body = (await request.json()) as UserAgentChatRequest;
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json(
      { ok: false, message: 'Message is required' },
      { status: 400 }
    );
  }
  logAgentRun('api.chat.received', {
    requestId,
    scope: 'user_agent',
    userId: user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    messageLength: message.length
  });

  const activeRun = await prisma.agentRun.findFirst({
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

  if (activeRun) {
    logAgentRun('api.chat.active_run', {
      requestId,
      runId: activeRun.id,
      scope: 'user_agent',
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

  const userMessage = await prisma.userAgentChatMessage.create({
    data: {
      content: message,
      role: 'user',
      userId: user.id
    }
  });
  const personalMcpUrl = new URL(
    '/api/mcp/personal',
    platformBaseUrl()
  ).toString();
  const run = await prisma.agentRun.create({
    data: {
      inputMessageId: userMessage.id,
      mode: 'use',
      model: userAgentModel(),
      payload: {
        message,
        personalMcpUrl,
        userEmail: user.email
      },
      requestId,
      scope: 'user_agent',
      status: 'queued',
      userId: user.id
    },
    select: {
      id: true
    }
  });
  logAgentRun('api.chat.run_created', {
    requestId,
    runId: run.id,
    scope: 'user_agent',
    userId: user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
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
    requestId,
    runId: run.id,
    scope: 'user_agent',
    userId: user.id
  }, {
    elapsedMs: elapsedSince(startedAt)
  });

  return NextResponse.json({
    ok: true,
    runId: run.id,
    userMessageId: userMessage.id
  });
}
