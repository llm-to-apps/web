import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { billAgentUsage } from '@/lib/billing';
import { agentRuntimeUrl, projectUseAgentModel } from '@/lib/env';
import { projectAgentMemoryIds } from '@/lib/agent-memory-ids';
import { projectMemberWhere } from '@/lib/project-members';
import { authenticateAuthToken, ensureAuthToken } from '@/lib/auth-tokens';
import { publishProjectChatChanged } from '@/lib/project-chat-events';
import { elapsedSince, logAgentRun, warnAgentRun } from '@/lib/agent-run-logger';

type JsonRpcRequest = {
  id?: string | number | null;
  jsonrpc?: '2.0';
  method?: string;
  params?: unknown;
};

type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type McpContext = {
  tokenId: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

type ToolCallParams = {
  name?: string;
  arguments?: unknown;
};

type AskAppAgentArguments = {
  appId?: string;
  message?: string;
};

export const runtime = 'nodejs';

const protocolVersion = '2025-06-18';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      name: 'OS7 Personal MCP',
      transport: 'streamable-http',
      endpoint: '/api/mcp/personal'
    },
    {
      headers: corsHeaders()
    }
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const authStartedAt = Date.now();
  const context = await authenticateRequest(request);
  logAgentRun('mcp.personal.auth.finished', {
    requestId
  }, {
    authElapsedMs: elapsedSince(authStartedAt),
    elapsedMs: elapsedSince(startedAt),
    ok: Boolean(context)
  });

  if (!context) {
    logAgentRun('mcp.personal.finished', {
      requestId
    }, {
      elapsedMs: elapsedSince(startedAt),
      status: 401
    });
    return jsonResponse(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32001,
          message: 'Unauthorized'
        }
      },
      401
    );
  }

  const parseStartedAt = Date.now();
  const payload = (await request.json().catch(() => null)) as JsonRpcRequest | JsonRpcRequest[] | null;
  logAgentRun('mcp.personal.payload.parsed', {
    requestId,
    userId: context.user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    isBatch: Array.isArray(payload),
    parseElapsedMs: elapsedSince(parseStartedAt),
    requestCount: Array.isArray(payload) ? payload.length : payload ? 1 : 0
  });

  if (!payload) {
    logAgentRun('mcp.personal.finished', {
      requestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      status: 400
    });
    return jsonResponse(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Invalid JSON'
        }
      },
      400
    );
  }

  if (Array.isArray(payload)) {
    const responses = (
      await Promise.all(
        payload.map((message, index) => handleJsonRpcMessage(message, context, {
          index,
          parentRequestId: requestId,
          postStartedAt: startedAt
        }))
      )
    ).filter(Boolean);
    logAgentRun('mcp.personal.finished', {
      requestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      responseCount: responses.length,
      status: responses.length > 0 ? 200 : 202
    });

    return responses.length > 0
      ? jsonResponse(responses)
      : new Response(null, { status: 202, headers: corsHeaders() });
  }

  const response = await handleJsonRpcMessage(payload, context, {
    parentRequestId: requestId,
    postStartedAt: startedAt
  });
  logAgentRun('mcp.personal.finished', {
    requestId,
    userId: context.user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    responseCount: response ? 1 : 0,
    status: response ? 200 : 202
  });

  return response
    ? jsonResponse(response)
    : new Response(null, { status: 202, headers: corsHeaders() });
}

async function handleJsonRpcMessage(
  request: JsonRpcRequest,
  context: McpContext,
  logContext: {
    index?: number;
    parentRequestId: string;
    postStartedAt: number;
  }
) {
  const startedAt = Date.now();
  const id = request.id ?? null;
  const messageRequestId = `${logContext.parentRequestId}${logContext.index === undefined ? '' : `:${logContext.index}`}`;

  logAgentRun('mcp.personal.message.started', {
    requestId: messageRequestId,
    userId: context.user.id
  }, {
    id,
    method: request.method ?? null,
    postElapsedMs: elapsedSince(logContext.postStartedAt)
  });

  if (!request.method) {
    logAgentRun('mcp.personal.message.finished', {
      requestId: messageRequestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      method: null,
      status: 'invalid_request'
    });
    return jsonRpcError(id, -32600, 'Invalid request');
  }

  if (request.method.startsWith('notifications/')) {
    logAgentRun('mcp.personal.message.finished', {
      requestId: messageRequestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      method: request.method,
      status: 'notification'
    });
    return null;
  }

  if (request.method === 'initialize') {
    logAgentRun('mcp.personal.message.finished', {
      requestId: messageRequestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      method: request.method,
      status: 'ok'
    });
    return jsonRpcResult(id, {
      protocolVersion,
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'os7-personal-mcp',
        version: '0.1.0'
      }
    });
  }

  if (request.method === 'tools/list') {
    logAgentRun('mcp.personal.message.finished', {
      requestId: messageRequestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      method: request.method,
      status: 'ok',
      toolCount: personalOsTools().length
    });
    return jsonRpcResult(id, {
      tools: personalOsTools()
    });
  }

  if (request.method === 'tools/call') {
    const params = request.params as ToolCallParams;
    const result = await callTool(params, context, {
      parentRequestId: messageRequestId,
      postStartedAt: logContext.postStartedAt
    });
    logAgentRun('mcp.personal.message.finished', {
      requestId: messageRequestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      method: request.method,
      status: 'ok',
      toolName: params.name ?? null
    });
    return jsonRpcResult(id, result);
  }

  logAgentRun('mcp.personal.message.finished', {
    requestId: messageRequestId,
    userId: context.user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    method: request.method,
    status: 'method_not_found'
  });
  return jsonRpcError(id, -32601, `Method not found: ${request.method}`);
}

async function callTool(
  params: ToolCallParams,
  context: McpContext,
  logContext: {
    parentRequestId: string;
    postStartedAt: number;
  }
) {
  const startedAt = Date.now();
  const requestId = `${logContext.parentRequestId}:${params.name ?? 'unknown_tool'}`;
  logAgentRun('mcp.personal.tool.started', {
    requestId,
    userId: context.user.id
  }, {
    postElapsedMs: elapsedSince(logContext.postStartedAt),
    toolName: params.name ?? null
  });

  if (params.name === 'list_apps') {
    const dbStartedAt = Date.now();
    const apps = await prisma.project.findMany({
      where: {
        members: projectMemberWhere(context.user.id),
        deletedAt: null,
        status: {
          notIn: ['deleting', 'deleted']
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        templateId: true,
        templateName: true,
        domain: true,
        url: true,
        status: true,
        deployError: true
      }
    });
    logAgentRun('mcp.personal.tool.finished', {
      requestId,
      userId: context.user.id
    }, {
      appCount: apps.length,
      dbElapsedMs: elapsedSince(dbStartedAt),
      elapsedMs: elapsedSince(startedAt),
      toolName: params.name
    });

    return toolJson({
      apps
    });
  }

  if (params.name === 'get_usage_summary') {
    const dbStartedAt = Date.now();
    const usage = await prisma.creditLedgerEntry.aggregate({
      where: {
        actorUserId: context.user.id,
        sourceType: 'agent_run'
      },
      _sum: {
        credits: true,
        costUsd: true
      }
    });
    const creditsUsed = Math.ceil(Math.abs(Math.min(Number(usage._sum.credits ?? 0), 0)));
    logAgentRun('mcp.personal.tool.finished', {
      requestId,
      userId: context.user.id
    }, {
      dbElapsedMs: elapsedSince(dbStartedAt),
      elapsedMs: elapsedSince(startedAt),
      toolName: params.name
    });

    return toolJson({
      creditsUsed,
      estimatedCostUsd: Number(usage._sum.costUsd ?? 0)
    });
  }

  if (params.name === 'ask_app_agent') {
    const result = await askAppAgent(params.arguments, context, {
      parentRequestId: requestId,
      postStartedAt: logContext.postStartedAt
    });
    logAgentRun('mcp.personal.tool.finished', {
      requestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      ok: result.ok,
      toolName: params.name
    });
    return toolJson(result);
  }

  warnAgentRun('mcp.personal.tool.unknown', {
    requestId,
    userId: context.user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    toolName: params.name ?? null
  });
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Unknown tool: ${params.name ?? 'missing'}`
      }
    ]
  };
}

async function askAppAgent(
  argumentsValue: unknown,
  context: McpContext,
  logContext: {
    parentRequestId: string;
    postStartedAt: number;
  }
) {
  const startedAt = Date.now();
  const args = argumentsValue as AskAppAgentArguments;
  const appId = typeof args.appId === 'string' ? args.appId.trim() : '';
  const message = typeof args.message === 'string' ? args.message.trim() : '';
  const requestId = crypto.randomUUID();
  const logRequestId = `${logContext.parentRequestId}:${requestId}`;

  logAgentRun('mcp.personal.ask_app_agent.started', {
    projectId: appId || null,
    requestId: logRequestId,
    userId: context.user.id
  }, {
    messageLength: message.length,
    postElapsedMs: elapsedSince(logContext.postStartedAt)
  });

  if (!appId || !message) {
    logAgentRun('mcp.personal.ask_app_agent.finished', {
      projectId: appId || null,
      requestId: logRequestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      ok: false,
      reason: 'invalid_arguments'
    });
    return {
      ok: false,
      message: 'appId and message are required'
    };
  }

  const projectStartedAt = Date.now();
  const project = await prisma.project.findFirst({
    where: {
      id: appId,
      members: projectMemberWhere(context.user.id, 'edit'),
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true,
      templateName: true,
      domain: true,
      url: true,
      status: true
    }
  });
  logAgentRun('mcp.personal.ask_app_agent.project.loaded', {
    projectId: appId,
    requestId: logRequestId,
    userId: context.user.id
  }, {
    dbElapsedMs: elapsedSince(projectStartedAt),
    elapsedMs: elapsedSince(startedAt),
    found: Boolean(project)
  });

  if (!project) {
    logAgentRun('mcp.personal.ask_app_agent.finished', {
      projectId: appId,
      requestId: logRequestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      ok: false,
      reason: 'project_not_found'
    });
    return {
      ok: false,
      message: 'Application not found'
    };
  }

  const mode = 'use';
  const agentUrl = agentRuntimeUrl();
  const model = projectUseAgentModel();
  const appMcpUrl = `${project.url.replace(/\/$/, '')}/api/mcp`;
  const tokenStartedAt = Date.now();
  const projectUserToken = await ensureAuthToken({
    name: `${project.templateName} MCP`,
    projectId: project.id,
    scope: 'project:mcp',
    subjectType: 'user',
    userId: context.user.id
  });
  logAgentRun('mcp.personal.ask_app_agent.token.ready', {
    projectId: project.id,
    requestId: logRequestId,
    userId: context.user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    tokenElapsedMs: elapsedSince(tokenStartedAt),
    tokenId: projectUserToken.id
  });
  const { resourceId: memoryResource, threadId: memoryThreadId } =
    projectAgentMemoryIds(context.user.id, project.id, mode);
  const userMessageStartedAt = Date.now();
  const userMessage = await prisma.projectAgentChatMessage.create({
    data: {
      userId: context.user.id,
      projectId: project.id,
      role: 'user',
      source: 'user_agent',
      mode,
      content: message
    }
  });
  logAgentRun('mcp.personal.ask_app_agent.user_message.persisted', {
    projectId: project.id,
    requestId: logRequestId,
    userId: context.user.id
  }, {
    dbElapsedMs: elapsedSince(userMessageStartedAt),
    elapsedMs: elapsedSince(startedAt),
    userMessageId: userMessage.id
  });
  notifyProjectChatChanged(context.user.id, project.id);

  if (!agentUrl) {
    const content = `I have the project context for ${project.templateName} (${project.domain}). The agent runtime is not connected yet.`;
    const assistantMessage = await prisma.projectAgentChatMessage.create({
      data: {
        userId: context.user.id,
        projectId: project.id,
        role: 'assistant',
        source: 'project_agent',
        mode,
        content
      }
    });
    await persistAgentUsage({
      assistantMessageId: assistantMessage.id,
      model,
      mode,
      projectId: project.id,
      requestId,
      usage: {},
      userId: context.user.id,
      userMessageId: userMessage.id
    });
    notifyProjectChatChanged(context.user.id, project.id);
    logAgentRun('mcp.personal.ask_app_agent.finished', {
      projectId: project.id,
      requestId: logRequestId,
      userId: context.user.id
    }, {
      elapsedMs: elapsedSince(startedAt),
      ok: true,
      reason: 'agent_runtime_missing'
    });

    return {
      ok: true,
      appId: project.id,
      appName: project.templateName,
      content
    };
  }

  const fetchStartedAt = Date.now();
  logAgentRun('mcp.personal.ask_app_agent.fetch.started', {
    projectId: project.id,
    requestId: logRequestId,
    userId: context.user.id
  }, {
    agentUrl,
    elapsedMs: elapsedSince(startedAt),
    model
  });
  const response = await fetch(`${agentUrl}/api/agents/projectUseAgent/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: message
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
            userId: context.user.id
          }
        }
      },
      instructions: `
You are working on project ${project.id}.
Application: ${project.templateName}
Domain: ${project.domain}
Status: ${project.status}
Mode: Use
Application MCP endpoint: ${appMcpUrl}

Rules:
- You are the OS7 project app agent for this app.
- You are running as a subagent called by the user's Personal OS agent.
- Use application MCP tools for app data operations: call listAppMcpTools when needed, then callAppMcpTool.
- Use the smallest number of app tool calls that can answer or complete the user's request.
- Return the business result in plain language. Do not dump raw tool JSON unless the user asks for it.
- Do not inspect or change source code.
- Do not use dev project tools, do not call project tools, and do not attempt to commit or push code changes.
- If the user asks to change UI, styles, source code, files, dependencies, runtime behavior, or developer configuration, stop and say that Dev mode is required.
`,
      maxSteps: 50,
      modelSettings: {
        temperature: 0.2
      },
      requestContext: {
        appMcpUrl,
        mode,
        model,
        projectDomain: project.domain,
        projectId: project.id,
        projectUserToken: projectUserToken.token,
        projectStatus: project.status,
        requestId
      }
    })
  });
  logAgentRun('mcp.personal.ask_app_agent.fetch.headers', {
    projectId: project.id,
    requestId: logRequestId,
    userId: context.user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    fetchElapsedMs: elapsedSince(fetchStartedAt),
    ok: response.ok,
    status: response.status
  });

  if (!response.ok || !response.body) {
    throw new Error(`Project agent request failed with ${response.status}`);
  }

  const collectStartedAt = Date.now();
  const result = await collectMastraStream(response.body, {
    parentStartedAt: startedAt,
    projectId: project.id,
    requestId: logRequestId,
    userId: context.user.id
  });
  logAgentRun('mcp.personal.ask_app_agent.stream.collected', {
    projectId: project.id,
    requestId: logRequestId,
    userId: context.user.id
  }, {
    collectElapsedMs: elapsedSince(collectStartedAt),
    contentLength: result.content.trim().length,
    elapsedMs: elapsedSince(startedAt),
    errorLength: result.error.trim().length,
    usage: result.usage
  });
  const content = result.content.trim() || result.error.trim() || 'Done.';
  const assistantMessageStartedAt = Date.now();
  const assistantMessage = await prisma.projectAgentChatMessage.create({
    data: {
      userId: context.user.id,
      projectId: project.id,
      role: 'assistant',
      source: 'project_agent',
      mode,
      content
    }
  });
  logAgentRun('mcp.personal.ask_app_agent.assistant_message.persisted', {
    projectId: project.id,
    requestId: logRequestId,
    userId: context.user.id
  }, {
    assistantMessageId: assistantMessage.id,
    dbElapsedMs: elapsedSince(assistantMessageStartedAt),
    elapsedMs: elapsedSince(startedAt)
  });
  const usageStartedAt = Date.now();
  await persistAgentUsage({
    assistantMessageId: assistantMessage.id,
    model,
    mode,
    projectId: project.id,
    requestId,
    usage: result.usage,
    userId: context.user.id,
    userMessageId: userMessage.id
  });
  logAgentRun('mcp.personal.ask_app_agent.usage.persisted', {
    projectId: project.id,
    requestId: logRequestId,
    userId: context.user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    usageElapsedMs: elapsedSince(usageStartedAt)
  });
  notifyProjectChatChanged(context.user.id, project.id);
  logAgentRun('mcp.personal.ask_app_agent.finished', {
    projectId: project.id,
    requestId: logRequestId,
    userId: context.user.id
  }, {
    elapsedMs: elapsedSince(startedAt),
    ok: true
  });

  return {
    ok: true,
    appId: project.id,
    appName: project.templateName,
    content,
    usage: result.usage
  };
}

async function collectMastraStream(
  body: ReadableStream<Uint8Array>,
  logContext: {
    parentStartedAt: number;
    projectId: string;
    requestId: string;
    userId: string;
  }
) {
  const startedAt = Date.now();
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  let content = '';
  let error = '';
  let usage: TokenUsage = {};
  let chunkCount = 0;
  let eventCount = 0;
  let firstChunkAt: number | null = null;
  let firstTextAt: number | null = null;
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunkCount++;
      totalBytes += value.byteLength;
      if (!firstChunkAt) {
        firstChunkAt = Date.now();
        logAgentRun('mcp.personal.ask_app_agent.stream.first_chunk', {
          projectId: logContext.projectId,
          requestId: logContext.requestId,
          userId: logContext.userId
        }, {
          bytes: value.byteLength,
          collectElapsedMs: firstChunkAt - startedAt,
          elapsedMs: firstChunkAt - logContext.parentStartedAt
        });
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = flushSseBuffer(buffer, (chunk) => {
        eventCount++;
        const text = extractStreamText(chunk);

        if (text) {
          content += text;
          if (!firstTextAt) {
            firstTextAt = Date.now();
            logAgentRun('mcp.personal.ask_app_agent.stream.first_text', {
              projectId: logContext.projectId,
              requestId: logContext.requestId,
              userId: logContext.userId
            }, {
              collectElapsedMs: firstTextAt - startedAt,
              elapsedMs: firstTextAt - logContext.parentStartedAt,
              eventCount
            });
          }
        }

        if (isObjectRecord(chunk) && chunk.type === 'error') {
          error += error ? `\n${extractErrorMessage(chunk)}` : extractErrorMessage(chunk);
        }

        usage = mergeTokenUsage(usage, extractTokenUsage(chunk));
      });
    }

    buffer += decoder.decode();
    flushSseBuffer(`${buffer}\n\n`, (chunk) => {
      eventCount++;
      const text = extractStreamText(chunk);

      if (text) {
        content += text;
        if (!firstTextAt) {
          firstTextAt = Date.now();
          logAgentRun('mcp.personal.ask_app_agent.stream.first_text', {
            projectId: logContext.projectId,
            requestId: logContext.requestId,
            userId: logContext.userId
          }, {
            collectElapsedMs: firstTextAt - startedAt,
            elapsedMs: firstTextAt - logContext.parentStartedAt,
            eventCount
          });
        }
      }

      if (isObjectRecord(chunk) && chunk.type === 'error') {
        error += error ? `\n${extractErrorMessage(chunk)}` : extractErrorMessage(chunk);
      }

      usage = mergeTokenUsage(usage, extractTokenUsage(chunk));
    });
  } finally {
    reader.releaseLock();
  }

  logAgentRun('mcp.personal.ask_app_agent.stream.finished', {
    projectId: logContext.projectId,
    requestId: logContext.requestId,
    userId: logContext.userId
  }, {
    chunkCount,
    collectElapsedMs: elapsedSince(startedAt),
    contentLength: content.trim().length,
    elapsedMs: elapsedSince(logContext.parentStartedAt),
    errorLength: error.trim().length,
    eventCount,
    firstChunkElapsedMs: firstChunkAt ? firstChunkAt - startedAt : null,
    firstTextElapsedMs: firstTextAt ? firstTextAt - startedAt : null,
    totalBytes
  });

  return {
    content,
    error,
    usage
  };
}

async function persistAgentUsage({
  assistantMessageId,
  model,
  mode,
  projectId,
  requestId,
  usage,
  userId,
  userMessageId
}: {
  assistantMessageId: string;
  model: string;
  mode: 'use';
  projectId: string;
  requestId: string;
  usage: TokenUsage;
  userId: string;
  userMessageId: string;
}) {
  await prisma.agentUsage.create({
    data: {
      assistantMessageId,
      completionTokens: usage.completionTokens ?? null,
      mode,
      model,
      projectId,
      promptTokens: usage.promptTokens ?? null,
      requestId,
      totalTokens: usage.totalTokens ?? null,
      userId,
      userMessageId
    }
  });
  await billAgentUsage({
    actorUserId: userId,
    model,
    projectId,
    requestId,
    usage
  });
}

function personalOsTools() {
  return [
    {
      name: 'list_apps',
      description: 'List applications available to the current OS7 user.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: 'get_usage_summary',
      description: 'Return total agent credit usage for the current OS7 user.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: 'ask_app_agent',
      description:
        'Delegate a task to one app agent in Use mode. This cannot modify app code or run Dev mode.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: {
            type: 'string',
            description: 'The app id returned by list_apps.'
          },
          message: {
            type: 'string',
            description: 'The task or question for the app agent.'
          }
        },
        required: ['appId', 'message'],
        additionalProperties: false
      }
    }
  ];
}

function toolJson(value: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2)
      }
    ],
    structuredContent: value
  };
}

async function authenticateRequest(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const [scheme, token] = authorization.split(/\s+/, 2);

  if (scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  const context = await authenticateAuthToken({
    scope: 'personal:mcp',
    subjectType: 'user',
    token
  });

  if (!context?.user) {
    return null;
  }

  return {
    tokenId: context.tokenId,
    user: context.user
  };
}

function jsonRpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

function jsonRpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  };
}

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders()
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };
}

function notifyProjectChatChanged(userId: string, projectId: string) {
  publishProjectChatChanged(userId, projectId).catch(() => undefined);
}

function flushSseBuffer(buffer: string, handleChunk: (chunk: unknown) => void) {
  const parts = buffer.split(/\r?\n\r?\n/);
  const remainder = parts.pop() ?? '';

  for (const part of parts) {
    const data = part
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (!data || data === '[DONE]') {
      continue;
    }

    handleChunk(parseJson(data) ?? data);
  }

  return remainder;
}

function extractStreamText(chunk: unknown) {
  if (typeof chunk === 'string') {
    return chunk;
  }

  if (!isObjectRecord(chunk)) {
    return '';
  }

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

function extractTokenUsage(chunk: unknown): TokenUsage {
  if (!isObjectRecord(chunk)) {
    return {};
  }

  const usage = findUsageObject(chunk);

  if (!usage) {
    return {};
  }

  return {
    completionTokens: readNumberField(usage, [
      'completionTokens',
      'outputTokens',
      'completion_tokens',
      'output_tokens'
    ]),
    promptTokens: readNumberField(usage, [
      'promptTokens',
      'inputTokens',
      'prompt_tokens',
      'input_tokens'
    ]),
    totalTokens: readNumberField(usage, ['totalTokens', 'total_tokens'])
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

  if (
    [
      'completionTokens',
      'completion_tokens',
      'inputTokens',
      'input_tokens',
      'outputTokens',
      'output_tokens',
      'promptTokens',
      'prompt_tokens',
      'totalTokens',
      'total_tokens'
    ].some((key) => typeof value[key] === 'number')
  ) {
    return value;
  }

  for (const key of ['usage', 'totalUsage', 'stepUsage', 'payload', 'data', 'output', 'steps']) {
    const nestedUsage = findUsageObject(value[key]);

    if (nestedUsage) {
      return nestedUsage;
    }
  }

  return null;
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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
