import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

type AgentChatContext = {
  params: Promise<{ id: string }> | { id: string };
};

type AgentChatRequest = {
  message?: string;
};

type AgentStreamEvent =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'progress';
      message: string;
    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'done';
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

  const streamUrl = `${agentUrl.replace(/\/$/, '')}/api/agents/projectAgent/stream`;

  console.info('[agent-chat] forwarding to agent', {
    requestId,
    projectId: project.id,
    streamUrl
  });

  const agentResponse = await fetch(
    streamUrl,
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
- You are the llm-to-apps project coding agent for this app, not the underlying model provider.
- Answer once. Do not repeat the same sentence.
- Use the tools endpoint for runtime facts and code changes when project tools are available.
- Search file contents with searchProjectFiles.
- Change files with patchProjectFiles for focused edits and writeProjectFile for new/complete file writes.
- After changing files, run a relevant check with runProjectCommand when possible.
- Do not announce tool usage before calling a tool.
- After a tool result, answer with the result. Do not call the same tool twice with the same arguments.
- Do not say "let me check" unless you actually call a tool.
- Do not claim you changed files unless a tool call confirms it.
`,
        maxSteps: 15,
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

  console.info('[agent-chat] agent stream response', {
    requestId,
    projectId: project.id,
    status: agentResponse.status,
    ok: agentResponse.ok,
    durationMs: Date.now() - startedAt
  });

  if (!agentResponse.ok || !agentResponse.body) {
    console.error('[agent-chat] agent request failed', {
      requestId,
      projectId: project.id,
      status: agentResponse.status,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json(
      {
        ok: false,
        message: `Agent request failed with ${agentResponse.status}`
      },
      { status: 502 }
    );
  }

  return new Response(createAgentChatStream(agentResponse.body, requestId, project.id), {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no'
    }
  });
}

function createAgentChatStream(
  mastraBody: ReadableStream<Uint8Array>,
  requestId: string,
  projectId: string
) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = mastraBody.getReader();
  let buffer = '';

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeEvent = (event: AgentStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      writeEvent({ type: 'progress', message: 'Agent started.' });

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          buffer = flushSseBuffer(buffer, writeEvent);
        }

        buffer += decoder.decode();
        flushSseBuffer(`${buffer}\n\n`, writeEvent);
        writeEvent({ type: 'done' });

        console.info('[agent-chat] stream completed', {
          requestId,
          projectId
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Agent stream failed';

        console.error('[agent-chat] stream failed', {
          requestId,
          projectId,
          message
        });

        writeEvent({ type: 'error', message });
      } finally {
        controller.close();
        reader.releaseLock();
      }
    }
  });
}

function flushSseBuffer(
  buffer: string,
  writeEvent: (event: AgentStreamEvent) => void
) {
  const parts = buffer.split(/\r?\n\r?\n/);
  const remainder = parts.pop() ?? '';

  for (const part of parts) {
    handleSseEvent(part, writeEvent);
  }

  return remainder;
}

function handleSseEvent(
  eventBlock: string,
  writeEvent: (event: AgentStreamEvent) => void
) {
  const data = eventBlock
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');

  if (!data || data === '[DONE]') {
    return;
  }

  const parsed = parseJson(data);

  if (!parsed) {
    writeEvent({ type: 'text', text: data });
    return;
  }

  for (const event of mapMastraStreamEvent(parsed)) {
    writeEvent(event);
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapMastraStreamEvent(chunk: unknown): AgentStreamEvent[] {
  if (!isObjectRecord(chunk)) {
    return [];
  }

  const type = typeof chunk.type === 'string' ? chunk.type : '';
  const text = extractStreamText(chunk);

  if (text) {
    return [{ type: 'text', text }];
  }

  if (type.includes('tool-call') || type === 'tool-input-start') {
    return [
      {
        type: 'progress',
        message: `Running ${extractToolName(chunk) ?? 'tool'}...`
      }
    ];
  }

  if (type.includes('tool-result') || type.includes('tool-output')) {
    return [
      {
        type: 'progress',
        message: `Finished ${extractToolName(chunk) ?? 'tool'}.`
      }
    ];
  }

  if (type.includes('step-start')) {
    return [{ type: 'progress', message: 'Agent step started.' }];
  }

  if (type.includes('step-finish') || type.includes('finish-step')) {
    return [{ type: 'progress', message: 'Agent step finished.' }];
  }

  if (type === 'error') {
    return [
      {
        type: 'error',
        message: extractErrorMessage(chunk)
      }
    ];
  }

  return [];
}

function extractStreamText(chunk: Record<string, unknown>) {
  for (const key of ['textDelta', 'delta', 'text']) {
    const value = chunk[key];

    if (typeof value === 'string' && value) {
      return value;
    }
  }

  return '';
}

function extractToolName(chunk: Record<string, unknown>) {
  for (const key of ['toolName', 'name']) {
    const value = chunk[key];

    if (typeof value === 'string' && value) {
      return value;
    }
  }

  const toolCall = chunk.toolCall;

  if (isObjectRecord(toolCall) && typeof toolCall.toolName === 'string') {
    return toolCall.toolName;
  }

  return null;
}

function extractErrorMessage(chunk: Record<string, unknown>) {
  const error = chunk.error;

  if (typeof error === 'string') {
    return error;
  }

  if (isObjectRecord(error) && typeof error.message === 'string') {
    return error.message;
  }

  return 'Agent stream returned an error.';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
