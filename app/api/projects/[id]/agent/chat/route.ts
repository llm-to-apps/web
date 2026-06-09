import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

type AgentChatContext = {
  params: Promise<{ id: string }> | { id: string };
};

type AgentChatRequest = {
  message?: string;
  mode?: 'use' | 'dev';
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
      appMcpToken: true,
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
  const appMcpUrl = `${project.url.replace(/\/$/, '')}/api/mcp`;
  const mode = body.mode === 'dev' ? 'dev' : 'use';

  console.info('[agent-chat] request', {
    requestId,
    projectId: project.id,
    domain: project.domain,
    status: project.status,
    hasAgentUrl: Boolean(agentUrl),
    hasAgentToolsToken: Boolean(project.agentToolsToken),
    hasAppMcpToken: Boolean(project.appMcpToken),
    mode,
    messageLength: body.message.trim().length,
    toolsUrl,
    appMcpUrl
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
Mode: ${mode === 'dev' ? 'Dev' : 'Use'}
${mode === 'dev' ? `Agent tools endpoint: ${toolsUrl}` : `Application MCP endpoint: ${appMcpUrl}`}

Rules:
- You are the llm-to-apps project coding agent for this app, not the underlying model provider.
- Answer once. Do not repeat the same sentence.
${mode === 'dev' ? devModeRules() : useModeRules()}
- Do not announce tool usage before calling a tool.
- After a tool result, answer with the result. Do not call the same tool twice with the same arguments.
- Do not say "let me check" unless you actually call a tool.
- Do not claim you changed files unless a tool call confirms it.
- When answering about application data, keep the answer concise and do not include internal IDs unless the user asks for them.
`,
        maxSteps: 15,
        modelSettings: {
          temperature: 0.2
        },
        requestContext: {
          projectId: project.id,
          projectDomain: project.domain,
          projectStatus: project.status,
          mode,
          toolsUrl: mode === 'dev' ? toolsUrl : undefined,
          agentToolsToken: mode === 'dev' ? project.agentToolsToken : undefined,
          appMcpUrl: mode === 'use' ? appMcpUrl : undefined,
          appMcpToken: mode === 'use' ? project.appMcpToken : undefined
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

function useModeRules() {
  return `- You are in Use mode.
- Use application MCP tools for app data operations: call listAppMcpTools when needed, then callAppMcpTool.
- Do not inspect or change source code.
- Do not use dev project tools.`;
}

function devModeRules() {
  return `- You are in Dev mode.
- Use agent dev tools for runtime facts, source inspection, code, UI, behavior, dependency, and file changes.
- Do not use application MCP tools.
- Search file contents with searchProjectFiles.
- For simple text changes like renaming app title/copy, use this flow: searchProjectFiles, readProjectFile for matching files or ranges, replaceTextInFile, then getProjectDiff.
- Prefer replaceTextInFile for exact renames and copy changes.
- Use patchProjectFiles only for small, high-confidence unified diffs. If patchProjectFiles fails once, do not retry patchProjectFiles for the same file; read the file and use writeProjectFile instead.
- Use writeProjectFile when replacing a whole file intentionally, when creating a new file, or when a patch failed.
- After changing files, run a relevant check with runProjectCommand when possible.
- Never use runProjectCommand for source search commands such as grep, find, rg, awk, or sed. Use searchProjectFiles.
- Do not call getProjectGitStatus unless the user asks for git status or a change summary.
- Do not inspect package.json, README.md, logs, git status, or the file tree for a simple rename unless searchProjectFiles shows they contain the target text.`;
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

  if (type === 'tool-call') {
    return [
      {
        type: 'progress',
        message: formatToolProgressMessage('Running', chunk)
      }
    ];
  }

  if (type === 'tool-result' || type === 'tool-output') {
    return [
      {
        type: 'progress',
        message: formatToolProgressMessage('Finished', chunk)
      }
    ];
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

  const payload = chunk.payload;

  if (isObjectRecord(payload)) {
    for (const key of ['textDelta', 'delta', 'text']) {
      const value = payload[key];

      if (typeof value === 'string' && value) {
        return value;
      }
    }
  }

  return '';
}

function formatToolProgressMessage(action: 'Running' | 'Finished', chunk: Record<string, unknown>) {
  const toolName = extractToolName(chunk) ?? 'tool';
  const details =
    action === 'Running'
      ? summarizeToolInput(extractToolInput(chunk))
      : summarizeToolOutput(extractToolOutput(chunk));

  return details ? `${action} ${toolName}\n${details}` : `${action} ${toolName}`;
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

  const toolCallDelta = chunk.toolCallDelta;

  if (isObjectRecord(toolCallDelta) && typeof toolCallDelta.toolName === 'string') {
    return toolCallDelta.toolName;
  }

  const payload = chunk.payload;

  if (isObjectRecord(payload) && typeof payload.toolName === 'string') {
    return payload.toolName;
  }

  return null;
}

function extractToolInput(chunk: Record<string, unknown>): unknown {
  return firstKnownValue(chunk, [
    'args',
    'input',
    'toolInput',
    'toolArgs',
    'arguments',
    'inputData'
  ]);
}

function extractToolOutput(chunk: Record<string, unknown>): unknown {
  return firstKnownValue(chunk, [
    'result',
    'output',
    'toolResult',
    'toolOutput',
    'content',
    'data'
  ]);
}

function firstKnownValue(chunk: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = chunk[key];

    if (value !== undefined) {
      return value;
    }
  }

  for (const nestedKey of ['payload', 'toolCall', 'toolCallDelta', 'toolInvocation']) {
    const value = chunk[nestedKey];

    if (isObjectRecord(value)) {
      const nestedValue = firstKnownValue(value, keys);

      if (nestedValue !== undefined) {
        return nestedValue;
      }
    }
  }

  return undefined;
}

function summarizeToolInput(input: unknown) {
  const parsedInput = parsePossiblyJson(input);

  if (!isObjectRecord(parsedInput)) {
    return summarizeUnknownValue(parsedInput);
  }

  const lines: string[] = [];

  appendField(lines, parsedInput, 'command');
  appendField(lines, parsedInput, 'cwd');
  appendField(lines, parsedInput, 'path');
  appendField(lines, parsedInput, 'name');
  appendField(lines, parsedInput, 'search');
  appendField(lines, parsedInput, 'replace');
  appendField(lines, parsedInput, 'expectedReplacements');
  appendField(lines, parsedInput, 'query');
  appendField(lines, parsedInput, 'maxDepth');
  appendField(lines, parsedInput, 'tail');

  const changes = parsedInput.changes;

  if (Array.isArray(changes)) {
    lines.push(`changes: ${changes.length}`);
  }

  if (isObjectRecord(parsedInput.arguments)) {
    lines.push(`arguments: ${truncateText(JSON.stringify(parsedInput.arguments), 260)}`);
  }

  return lines.length > 0 ? lines.join('\n') : summarizeUnknownValue(parsedInput);
}

function summarizeToolOutput(output: unknown) {
  const parsedOutput = parsePossiblyJson(output);

  if (!isObjectRecord(parsedOutput)) {
    return summarizeUnknownValue(parsedOutput);
  }

  const lines: string[] = [];

  appendField(lines, parsedOutput, 'path');
  appendField(lines, parsedOutput, 'exitCode');
  appendField(lines, parsedOutput, 'status');
  appendField(lines, parsedOutput, 'ok');

  const entries = parsedOutput.entries;

  if (Array.isArray(entries)) {
    lines.push(`entries: ${entries.length}`);
  }

  appendTextPreview(lines, parsedOutput, 'stdout');
  appendTextPreview(lines, parsedOutput, 'stderr');
  appendTextPreview(lines, parsedOutput, 'content');

  return lines.length > 0 ? lines.join('\n') : summarizeUnknownValue(parsedOutput);
}

function appendField(lines: string[], record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    lines.push(`${key}: ${truncateText(String(value), 180)}`);
  }
}

function appendTextPreview(lines: string[], record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (typeof value === 'string' && value.trim()) {
    lines.push(`${key}: ${truncateText(value.trim(), 260)}`);
  }
}

function parsePossiblyJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue.startsWith('{') && !trimmedValue.startsWith('[')) {
    return value;
  }

  return parseJson(trimmedValue) ?? value;
}

function summarizeUnknownValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return truncateText(value, 260);
  }

  return truncateText(JSON.stringify(value, null, 2), 360);
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
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
