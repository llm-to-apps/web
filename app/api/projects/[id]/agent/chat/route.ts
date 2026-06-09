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
  steps?: Array<{
    toolResults?: Array<{
      payload?: {
        toolName?: string;
        result?: unknown;
      };
    }>;
  }>;
  response?: {
    messages?: Array<{
      content?: unknown;
    }>;
  };
};

type ProjectFileEntry = {
  path: string;
  type: 'file' | 'dir';
  size?: number;
  depth?: number;
};

type CommandResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
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
        maxSteps: 1,
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
    toolResults: countToolResults(agentResult),
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
  const text = collapseRepeatedSentences(
    result.text || extractLastMessageText(result) || ''
  );
  const toolText = extractLatestToolResultText(result);

  if (toolText && isToolPreamble(text)) {
    return toolText;
  }

  return text || toolText || 'The agent returned an empty response.';
}

function extractLastMessageText(result: MastraGenerateResult) {
  const content = result.response?.messages?.at(-1)?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (
          part &&
          typeof part === 'object' &&
          'type' in part &&
          part.type === 'text' &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function extractLatestToolResultText(result: MastraGenerateResult) {
  const toolResult = result.steps
    ?.flatMap((step) => step.toolResults ?? [])
    .at(-1)?.payload;

  if (!toolResult) {
    return '';
  }

  return formatToolResult(toolResult.toolName, toolResult.result);
}

function formatToolResult(toolName: string | undefined, result: unknown) {
  if (toolName === 'listProjectFiles' && isFileTreeResult(result)) {
    return [
      `Files (${result.entries.length}):`,
      ...result.entries.map((entry) => {
        const suffix = entry.type === 'dir' ? '/' : '';
        return `- ${entry.path}${suffix}`;
      })
    ].join('\n');
  }

  if (toolName === 'readProjectFile' && isReadFileResult(result)) {
    return [`${result.path}:`, '```', result.content, '```'].join('\n');
  }

  if (toolName === 'getProjectAppLogs' && isObjectRecord(result)) {
    const logs = result.logs ?? result.content ?? result.stdout;

    if (typeof logs === 'string') {
      return logs.trim() || 'No application logs returned.';
    }
  }

  if (toolName === 'searchProjectFiles' && isCommandResult(result)) {
    if (result.exitCode === 1 || !result.stdout.trim()) {
      return 'No matches found.';
    }

    return result.stdout.trim();
  }

  if (
    (toolName === 'runProjectCommand' ||
      toolName === 'patchProjectFiles' ||
      toolName === 'getProjectGitStatus') &&
    isCommandResult(result)
  ) {
    return [
      `Command: ${result.command}`,
      `Exit code: ${result.exitCode}`,
      result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : '',
      result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (toolName === 'writeProjectFile' && isObjectRecord(result) && typeof result.path === 'string') {
    return `Wrote ${result.path}.`;
  }

  return JSON.stringify(result, null, 2);
}

function isFileTreeResult(result: unknown): result is { entries: ProjectFileEntry[] } {
  return (
    isObjectRecord(result) &&
    Array.isArray(result.entries) &&
    result.entries.every(
      (entry) =>
        isObjectRecord(entry) &&
        typeof entry.path === 'string' &&
        (entry.type === 'file' || entry.type === 'dir')
    )
  );
}

function isReadFileResult(result: unknown): result is { path: string; content: string } {
  return (
    isObjectRecord(result) &&
    typeof result.path === 'string' &&
    typeof result.content === 'string'
  );
}

function isCommandResult(result: unknown): result is CommandResult {
  return (
    isObjectRecord(result) &&
    typeof result.command === 'string' &&
    typeof result.exitCode === 'number' &&
    typeof result.stdout === 'string' &&
    typeof result.stderr === 'string'
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isToolPreamble(text: string) {
  if (!text.trim()) {
    return true;
  }

  const normalized = text.trim().toLowerCase();

  return (
    normalized.startsWith("i'll ") ||
    normalized.startsWith('i will ') ||
    normalized.startsWith('let me ') ||
    normalized.includes('get the list of files')
  );
}

function countToolResults(result: MastraGenerateResult | null) {
  return result?.steps?.reduce((count, step) => count + (step.toolResults?.length ?? 0), 0) ?? 0;
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
