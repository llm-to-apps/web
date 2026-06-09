import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

type AgentChatContext = {
  params: Promise<{ id: string }> | { id: string };
};

type AgentChatRequest = {
  message?: string;
};

export async function POST(request: NextRequest, context: AgentChatContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before chatting with the agent' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const body = (await request.json()) as AgentChatRequest;
  const project = await prisma.project.findFirst({
    where: {
      id,
      userId: user.id
    },
    select: {
      id: true,
      templateName: true,
      domain: true,
      status: true
    }
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, message: 'Application not found' },
      { status: 404 }
    );
  }

  if (!body.message?.trim()) {
    return NextResponse.json(
      { ok: false, message: 'Message is required' },
      { status: 400 }
    );
  }

  const agentUrl = process.env.AGENT_URL;
  const toolsUrl = `http://project-${project.id}:7070`;

  if (!agentUrl) {
    return NextResponse.json({
      ok: true,
      message: {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I have the project context for ${project.templateName} (${project.domain}). The agent runtime is not connected yet.`
      }
    });
  }

  return NextResponse.json({
    ok: true,
    message: {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `I am ready to work on ${project.templateName}. Tools endpoint: ${toolsUrl}. Agent runtime: ${agentUrl}.`
    }
  });
}
