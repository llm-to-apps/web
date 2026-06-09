import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

type AgentChatContext = {
  params: Promise<{ id: string }> | { id: string };
};

type AgentChatRequest = {
  message?: string;
};

type MastraGenerateResult = {
  text?: string;
  response?: {
    messages?: Array<{
      content?: string;
    }>;
  };
};

export async function POST(request: NextRequest, context: AgentChatContext) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
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
      url: true,
      agentToolsToken: true,
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
  const toolsUrl = `${project.url.replace(/\/$/, '')}/agent-tools`;

  console.info('[agent-chat] request', {
    requestId,
    projectId: project.id,
    domain: project.domain,
    status: project.status,
    hasAgentUrl: Boolean(agentUrl),
    hasAgentToolsToken: Boolean(project.agentToolsToken),
    messageLength: body.message.trim().length,
    toolsUrl
  });

  if (!agentUrl) {
    console.warn('[agent-chat] agent url is not configured', {
      requestId,
      projectId: project.id
    });

    return NextResponse.json({
      ok: true,
      message: {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I have the project context for ${project.templateName} (${project.domain}). The agent runtime is not connected yet.`
      }
    });
  }

  const generateUrl = `${agentUrl.replace(/\/$/, '')}/api/agents/projectAgent/generate`;

  console.info('[agent-chat] forwarding to agent', {
    requestId,
    projectId: project.id,
    generateUrl
  });

  const agentResponse = await fetch(
    generateUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: body.message.trim()
          }
        ],
        instructions: `
You are working on project ${project.id}.
Application: ${project.templateName}
Domain: ${project.domain}
Status: ${project.status}
Agent tools endpoint: ${toolsUrl}

Rules:
- Answer once. Do not repeat the same sentence.
- Use the tools endpoint for runtime facts and code changes when project tools are available.
- Do not say "let me check" unless you actually call a tool.
- Do not claim you changed files unless a tool call confirms it.
`,
        maxSteps: 3,
        modelSettings: {
          temperature: 0.2
        },
        requestContext: {
          projectId: project.id,
          projectDomain: project.domain,
          projectStatus: project.status,
          toolsUrl,
          agentToolsToken: project.agentToolsToken
        }
      })
    }
  );
  const agentResult = (await agentResponse.json().catch(() => null)) as
    | MastraGenerateResult
    | null;
  const durationMs = Date.now() - startedAt;

  console.info('[agent-chat] agent response', {
    requestId,
    projectId: project.id,
    status: agentResponse.status,
    ok: agentResponse.ok,
    durationMs,
    hasText: Boolean(agentResult?.text),
    responseMessages: agentResult?.response?.messages?.length ?? 0
  });

  if (!agentResponse.ok || !agentResult) {
    console.error('[agent-chat] agent request failed', {
      requestId,
      projectId: project.id,
      status: agentResponse.status,
      durationMs
    });

    return NextResponse.json(
      {
        ok: false,
        message: `Agent request failed with ${agentResponse.status}`
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: extractAgentText(agentResult)
    }
  });
}

function extractAgentText(result: MastraGenerateResult) {
  const lastMessage = result.response?.messages?.at(-1)?.content;

  return collapseRepeatedSentences(
    result.text || lastMessage || 'The agent returned an empty response.'
  );
}

function collapseRepeatedSentences(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[\s\S]*$/g);

  if (!sentences) {
    return text;
  }

  const seen = new Set<string>();
  const deduped = sentences.filter((sentence) => {
    const key = sentence.trim().toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return deduped.join('').trim();
}
