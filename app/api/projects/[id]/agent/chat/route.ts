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

type PersistedStreamContext = {
  mode: 'use' | 'dev';
  model: string;
  projectId: string;
  requestId: string;
  userMessageId?: string;
  userId: string;
};

type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
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
      type: 'usage';
      usage: TokenUsage;
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
  const userMessageContent = body.message.trim();
  const memoryResource = `user:${user.id}:project:${project.id}`;
  const memoryThreadId = `user:${user.id}:project:${project.id}:main`;
  const isMemoryDebugEnabled = process.env.AGENT_MEMORY_DEBUG === 'true';
  const agentModel = process.env.AGENT_MODEL ?? 'openai/gpt-5-mini';

  const userMessage = await prisma.agentChatMessage.create({
    data: {
      userId: user.id,
      projectId: project.id,
      role: 'user',
      mode,
      content: userMessageContent
    }
  });

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
    memoryResource,
    memoryThreadId,
    toolsUrl,
    appMcpUrl
  });

  console.info('[agent-chat] Mastra memory scope', {
    requestId,
    projectId: project.id,
    memoryEnabled: true,
    memoryProvider: 'mastra',
    memoryKind: 'message-history',
    memoryResource,
    memoryThreadId,
    memorySchema: process.env.MASTRA_DATABASE_SCHEMA ?? 'mastra',
    lastMessages: 20
  });

  if (!agentUrl) {
    const content = `I have the project context for ${project.templateName} (${project.domain}). The agent runtime is not connected yet.`;

    console.warn('[agent-chat] agent url is not configured', {
      requestId,
      projectId: project.id
    });

    const offlineContext: PersistedStreamContext = {
      mode,
      model: agentModel,
      projectId: project.id,
      requestId,
      userMessageId: userMessage.id,
      userId: user.id
    };
    const assistantMessageId = await persistAssistantMessage(offlineContext, content);
    await persistAgentUsage(offlineContext, {}, assistantMessageId);

    return NextResponse.json({
      ok: true,
      message: {
        id: crypto.randomUUID(),
        role: 'assistant',
        content
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
            content: userMessageContent
          }
        ],
        sendUsage: true,
        memory: {
          resource: memoryResource,
          thread: {
            id: memoryThreadId,
            title: `${project.templateName} main chat`,
            metadata: {
              projectId: project.id,
              projectDomain: project.domain,
              templateName: project.templateName,
              userId: user.id
            }
          }
        },
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
- Mastra memory may provide prior conversation context. Treat it as helpful context, not proof of current files, runtime state, or app data. Verify current facts with tools.
`,
        maxSteps: 50,
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

  return new Response(
    createAgentChatStream(agentResponse.body, requestId, {
      memoryDebug: isMemoryDebugEnabled
        ? {
            memoryResource,
            memorySchema: process.env.MASTRA_DATABASE_SCHEMA ?? 'mastra',
            memoryThreadId
          }
        : undefined,
      mode,
      model: agentModel,
      projectId: project.id,
      requestId,
      userMessageId: userMessage.id,
      userId: user.id
    }),
    {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no'
      }
    }
  );
}

function useModeRules() {
  return `- You are in Use mode.
- Use application MCP tools for app data operations: call listAppMcpTools when needed, then callAppMcpTool.
- Use the smallest number of app tool calls that can answer or complete the user's request.
- Return the business result in plain language. Do not dump raw tool JSON unless the user asks for it.
- Do not inspect or change source code.
- Do not use dev project tools.`;
}

function devModeRules() {
  return `- You are in Dev mode.
- Use agent dev tools for runtime facts, source inspection, code, UI, behavior, dependency, and file changes.
- Do not use application MCP tools.
- Classify the task before acting: inspect, edit, debug, verify, or explain.
- If the user asks whether your instructions mention AGENT.md or whether you are supposed to use it, answer yes: Dev mode instructions explicitly say to attempt to read AGENT.md before dev tasks and follow it when present. Do not search the project to answer this meta-instruction question.
- Before changing project code, database models, MCP tools, UI, dependencies, or files, attempt to read AGENT.md once with readProjectFile. If it exists, follow its project-specific rules. If it is missing, continue normally.
- When the user asks whether a concrete file exists or whether you can see a named file such as AGENT.md, call readProjectFile with that exact path. Do not use searchProjectFiles for filenames.
- Use the smallest workflow that can complete the task. Simple tasks should use only a few tool calls.
- Use getProjectAppStatus when you need to know whether the app process is running.
- Use restartProjectApp after code or dependency changes when the dev server needs to restart.
- Search file contents with searchProjectFiles.
- For simple text changes like renaming app title/copy, use this flow: searchProjectFiles, readProjectFile for matching files or ranges, replaceTextInFile, then getProjectDiff.
- Prefer replaceTextInFile for exact renames and copy changes.
- Use patchProjectFiles only for small, high-confidence unified diffs. If patchProjectFiles fails once, do not retry patchProjectFiles for the same file; read the file and use writeProjectFile instead.
- Use writeProjectFile when replacing a whole file intentionally, when creating a new file, or when a patch failed.
- After changing files, run a relevant check with runProjectCommand when possible.
- When using runProjectCommand, omit cwd or use a relative cwd such as ".". Never pass absolute paths as cwd.
- After Prisma schema changes, run npm run prisma:generate and npm run typecheck, restart the app process, then inspect app status or logs. Do not report success if these checks did not complete; report exactly what failed.
- Do not intentionally edit generated framework files such as next-env.d.ts. If a tool run changes next-env.d.ts, treat it as generated noise, not as a meaningful project change.
- Do not add UI or code fallbacks to hide missing required database tables or columns. Fix schema, migration, generated client, and seed instead.
- Never use runProjectCommand for source search commands such as grep, find, rg, awk, or sed. Use searchProjectFiles.
- Do not call getProjectGitStatus unless the user asks for git status or a change summary.
- Do not inspect package.json, README.md, logs, git status, or the file tree for a simple rename unless searchProjectFiles shows they contain the target text.
- Stop when the request is satisfied. Do not keep exploring after a successful edit, diff, and check.
- Final answers after edits must include what changed and what verification ran.`;
}

function formatMemoryDebugProgress({
  memoryResource,
  memorySchema,
  memoryThreadId
}: {
  memoryResource: string;
  memorySchema: string;
  memoryThreadId: string;
}) {
  return [
    'Agent started.',
    'Mastra Memory: enabled',
    'Memory kind: message-history',
    'Recall window: lastMessages=20',
    `Postgres schema: ${memorySchema}`,
    `Resource: ${memoryResource}`,
    `Thread: ${memoryThreadId}`
  ].join('\n');
}

function createAgentChatStream(
  mastraBody: ReadableStream<Uint8Array>,
  requestId: string,
  context: PersistedStreamContext & {
    memoryDebug?: {
      memoryResource: string;
      memorySchema: string;
      memoryThreadId: string;
    };
  }
) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = mastraBody.getReader();
  let buffer = '';
  let assistantContent = '';
  let assistantError = '';
  let tokenUsage: TokenUsage = {};

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeEvent = (event: AgentStreamEvent) => {
        if (event.type === 'text') {
          assistantContent += event.text;
        }

        if (event.type === 'error') {
          assistantError += assistantError ? `\n${event.message}` : event.message;
        }

        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      writeEvent({
        type: 'progress',
        message: context.memoryDebug
          ? formatMemoryDebugProgress(context.memoryDebug)
          : 'Agent started.'
      });

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          buffer = flushSseBuffer(buffer, writeEvent, (usage) => {
            tokenUsage = mergeTokenUsage(tokenUsage, usage);
          });
        }

        buffer += decoder.decode();
        flushSseBuffer(`${buffer}\n\n`, writeEvent, (usage) => {
          tokenUsage = mergeTokenUsage(tokenUsage, usage);
        });
        if (hasTokenUsage(tokenUsage)) {
          writeEvent({ type: 'usage', usage: tokenUsage });
        }
        writeEvent({ type: 'done' });

        console.info('[agent-chat] stream completed', {
          requestId,
          projectId: context.projectId
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Agent stream failed';

        console.error('[agent-chat] stream failed', {
          requestId,
          projectId: context.projectId,
          message
        });

        writeEvent({ type: 'error', message });
      } finally {
        const assistantMessageId = await persistAssistantMessage(
          context,
          assistantContent || assistantError
        );
        await persistAgentUsage(context, tokenUsage, assistantMessageId);
        controller.close();
        reader.releaseLock();
      }
    }
  });
}

async function persistAssistantMessage(context: PersistedStreamContext, content: string) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return null;
  }

  try {
    const message = await prisma.agentChatMessage.create({
      data: {
        userId: context.userId,
        projectId: context.projectId,
        role: 'assistant',
        mode: context.mode,
        content: trimmedContent
      }
    });

    return message.id;
  } catch (error) {
    console.error('[agent-chat] failed to persist assistant message', {
      projectId: context.projectId,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

async function persistAgentUsage(
  context: PersistedStreamContext,
  usage: TokenUsage,
  assistantMessageId: string | null
) {
  try {
    await prisma.agentUsage.upsert({
      where: {
        requestId: context.requestId
      },
      update: {
        assistantMessageId,
        completionTokens: usage.completionTokens ?? null,
        model: context.model,
        promptTokens: usage.promptTokens ?? null,
        totalTokens: usage.totalTokens ?? null
      },
      create: {
        assistantMessageId,
        completionTokens: usage.completionTokens ?? null,
        mode: context.mode,
        model: context.model,
        projectId: context.projectId,
        promptTokens: usage.promptTokens ?? null,
        requestId: context.requestId,
        totalTokens: usage.totalTokens ?? null,
        userId: context.userId,
        userMessageId: context.userMessageId ?? null
      }
    });
  } catch (error) {
    console.error('[agent-chat] failed to persist usage', {
      projectId: context.projectId,
      requestId: context.requestId,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function flushSseBuffer(
  buffer: string,
  writeEvent: (event: AgentStreamEvent) => void,
  recordUsage: (usage: TokenUsage) => void
) {
  const parts = buffer.split(/\r?\n\r?\n/);
  const remainder = parts.pop() ?? '';

  for (const part of parts) {
    handleSseEvent(part, writeEvent, recordUsage);
  }

  return remainder;
}

function handleSseEvent(
  eventBlock: string,
  writeEvent: (event: AgentStreamEvent) => void,
  recordUsage: (usage: TokenUsage) => void
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

  const usage = extractTokenUsage(parsed);
  if (hasTokenUsage(usage)) {
    recordUsage(usage);
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

function extractTokenUsage(chunk: unknown): TokenUsage {
  if (!isObjectRecord(chunk)) {
    return {};
  }

  const usageSource = findUsageObject(chunk);
  if (!usageSource) {
    return {};
  }

  return {
    completionTokens: readNumberField(usageSource, [
      'completionTokens',
      'output',
      'outputTokens',
      'completion_tokens',
      'output_tokens'
    ]),
    promptTokens: readNumberField(usageSource, [
      'input',
      'promptTokens',
      'inputTokens',
      'prompt_tokens',
      'input_tokens'
    ]),
    totalTokens: readNumberField(usageSource, ['totalTokens', 'total_tokens'])
  };
}

function findUsageObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedUsage = findUsageObject(item);

      if (nestedUsage) {
        return nestedUsage;
      }
    }

    return null;
  }

  if (!isObjectRecord(value)) {
    return null;
  }

  if (isUsageLike(value)) {
    return value;
  }

  for (const key of ['usage', 'totalUsage', 'stepUsage', 'payload', 'data', 'output', 'steps']) {
    const nestedValue = value[key];
    const nestedUsage = findUsageObject(nestedValue);

    if (nestedUsage) {
      return nestedUsage;
    }
  }

  return null;
}

function isUsageLike(value: Record<string, unknown>) {
  return [
    'completionTokens',
    'completion_tokens',
    'input',
    'inputTokens',
    'input_tokens',
    'output',
    'outputTokens',
    'output_tokens',
    'promptTokens',
    'prompt_tokens',
    'totalTokens',
    'total_tokens'
  ].some((key) => typeof value[key] === 'number');
}

function readNumberField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function mergeTokenUsage(currentUsage: TokenUsage, nextUsage: TokenUsage): TokenUsage {
  return {
    completionTokens: nextUsage.completionTokens ?? currentUsage.completionTokens,
    promptTokens: nextUsage.promptTokens ?? currentUsage.promptTokens,
    totalTokens: nextUsage.totalTokens ?? currentUsage.totalTokens
  };
}

function hasTokenUsage(usage: TokenUsage) {
  return (
    typeof usage.completionTokens === 'number' ||
    typeof usage.promptTokens === 'number' ||
    typeof usage.totalTokens === 'number'
  );
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
