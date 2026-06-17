import { projectAgentMemoryIds } from '@/server/agent/memory-ids'
import { elapsedSince, logAgentRun } from '@/server/agent/run-logger'
import { publishProjectChatChanged } from '@/server/agent/project-chat-events'
import { ensureAuthToken } from '@/server/auth/tokens'
import { prisma } from '@/server/db'
import { agentRuntimeUrl, projectUseAgentModel } from '@/server/env'
import { projectMemberWhere } from '@/server/project-members'

import { type AskAppAgentArguments, type McpContext } from './schema'
import { collectMastraStream } from './stream'
import { persistPersonalMcpAgentUsage } from './usage-persistence'

export async function askAppAgent(
  argumentsValue: unknown,
  context: McpContext,
  logContext: {
    parentRequestId: string
    postStartedAt: number
  }
) {
  const startedAt = Date.now()
  const args = argumentsValue as AskAppAgentArguments
  const appId = typeof args.appId === 'string' ? args.appId.trim() : ''
  const message = typeof args.message === 'string' ? args.message.trim() : ''
  const requestId = crypto.randomUUID()
  const logRequestId = `${logContext.parentRequestId}:${requestId}`

  logAgentRun(
    'mcp.personal.ask_app_agent.started',
    {
      projectId: appId || null,
      requestId: logRequestId,
      userId: context.user.id
    },
    {
      messageLength: message.length,
      postElapsedMs: elapsedSince(logContext.postStartedAt)
    }
  )

  if (!appId || !message) {
    logAgentRun(
      'mcp.personal.ask_app_agent.finished',
      {
        projectId: appId || null,
        requestId: logRequestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        ok: false,
        reason: 'invalid_arguments'
      }
    )
    return {
      ok: false,
      message: 'appId and message are required'
    }
  }

  const projectStartedAt = Date.now()
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
  })
  logAgentRun(
    'mcp.personal.ask_app_agent.project.loaded',
    {
      projectId: appId,
      requestId: logRequestId,
      userId: context.user.id
    },
    {
      dbElapsedMs: elapsedSince(projectStartedAt),
      elapsedMs: elapsedSince(startedAt),
      found: Boolean(project)
    }
  )

  if (!project) {
    logAgentRun(
      'mcp.personal.ask_app_agent.finished',
      {
        projectId: appId,
        requestId: logRequestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        ok: false,
        reason: 'project_not_found'
      }
    )
    return {
      ok: false,
      message: 'Application not found'
    }
  }

  const mode = 'use'
  const agentUrl = agentRuntimeUrl()
  const model = projectUseAgentModel()
  const appMcpUrl = `${project.url.replace(/\/$/, '')}/api/mcp`
  const tokenStartedAt = Date.now()
  const projectUserToken = await ensureAuthToken({
    name: `${project.templateName} MCP`,
    projectId: project.id,
    scope: 'project:mcp',
    subjectType: 'user',
    userId: context.user.id
  })
  logAgentRun(
    'mcp.personal.ask_app_agent.token.ready',
    {
      projectId: project.id,
      requestId: logRequestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      tokenElapsedMs: elapsedSince(tokenStartedAt),
      tokenId: projectUserToken.id
    }
  )
  const { resourceId: memoryResource, threadId: memoryThreadId } = projectAgentMemoryIds(
    context.user.id,
    project.id,
    mode
  )
  const userMessageStartedAt = Date.now()
  const userMessage = await prisma.projectAgentChatMessage.create({
    data: {
      userId: context.user.id,
      projectId: project.id,
      role: 'user',
      source: 'user_agent',
      mode,
      content: message
    }
  })
  logAgentRun(
    'mcp.personal.ask_app_agent.user_message.persisted',
    {
      projectId: project.id,
      requestId: logRequestId,
      userId: context.user.id
    },
    {
      dbElapsedMs: elapsedSince(userMessageStartedAt),
      elapsedMs: elapsedSince(startedAt),
      userMessageId: userMessage.id
    }
  )
  notifyProjectChatChanged(context.user.id, project.id)

  if (!agentUrl) {
    const content = `I have the project context for ${project.templateName} (${project.domain}). The agent runtime is not connected yet.`
    const assistantMessage = await prisma.projectAgentChatMessage.create({
      data: {
        userId: context.user.id,
        projectId: project.id,
        role: 'assistant',
        source: 'project_agent',
        mode,
        content
      }
    })
    await persistPersonalMcpAgentUsage({
      assistantMessageId: assistantMessage.id,
      model,
      mode,
      projectId: project.id,
      requestId,
      usage: {},
      userId: context.user.id,
      userMessageId: userMessage.id
    })
    notifyProjectChatChanged(context.user.id, project.id)
    logAgentRun(
      'mcp.personal.ask_app_agent.finished',
      {
        projectId: project.id,
        requestId: logRequestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        ok: true,
        reason: 'agent_runtime_missing'
      }
    )

    return {
      ok: true,
      appId: project.id,
      appName: project.templateName,
      content
    }
  }

  const fetchStartedAt = Date.now()
  logAgentRun(
    'mcp.personal.ask_app_agent.fetch.started',
    {
      projectId: project.id,
      requestId: logRequestId,
      userId: context.user.id
    },
    {
      agentUrl,
      elapsedMs: elapsedSince(startedAt),
      model
    }
  )
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
  })
  logAgentRun(
    'mcp.personal.ask_app_agent.fetch.headers',
    {
      projectId: project.id,
      requestId: logRequestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      fetchElapsedMs: elapsedSince(fetchStartedAt),
      ok: response.ok,
      status: response.status
    }
  )

  if (!response.ok || !response.body) {
    throw new Error(`Project agent request failed with ${response.status}`)
  }

  const collectStartedAt = Date.now()
  const result = await collectMastraStream(response.body, {
    parentStartedAt: startedAt,
    projectId: project.id,
    requestId: logRequestId,
    userId: context.user.id
  })
  logAgentRun(
    'mcp.personal.ask_app_agent.stream.collected',
    {
      projectId: project.id,
      requestId: logRequestId,
      userId: context.user.id
    },
    {
      collectElapsedMs: elapsedSince(collectStartedAt),
      contentLength: result.content.trim().length,
      elapsedMs: elapsedSince(startedAt),
      errorLength: result.error.trim().length,
      usage: result.usage
    }
  )
  const content = result.content.trim() || result.error.trim() || 'Done.'
  const assistantMessageStartedAt = Date.now()
  const assistantMessage = await prisma.projectAgentChatMessage.create({
    data: {
      userId: context.user.id,
      projectId: project.id,
      role: 'assistant',
      source: 'project_agent',
      mode,
      content
    }
  })
  logAgentRun(
    'mcp.personal.ask_app_agent.assistant_message.persisted',
    {
      projectId: project.id,
      requestId: logRequestId,
      userId: context.user.id
    },
    {
      assistantMessageId: assistantMessage.id,
      dbElapsedMs: elapsedSince(assistantMessageStartedAt),
      elapsedMs: elapsedSince(startedAt)
    }
  )
  const usageStartedAt = Date.now()
  await persistPersonalMcpAgentUsage({
    assistantMessageId: assistantMessage.id,
    model,
    mode,
    projectId: project.id,
    requestId,
    usage: result.usage,
    userId: context.user.id,
    userMessageId: userMessage.id
  })
  logAgentRun(
    'mcp.personal.ask_app_agent.usage.persisted',
    {
      projectId: project.id,
      requestId: logRequestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      usageElapsedMs: elapsedSince(usageStartedAt)
    }
  )
  notifyProjectChatChanged(context.user.id, project.id)
  logAgentRun(
    'mcp.personal.ask_app_agent.finished',
    {
      projectId: project.id,
      requestId: logRequestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      ok: true
    }
  )

  return {
    ok: true,
    appId: project.id,
    appName: project.templateName,
    content,
    usage: result.usage
  }
}

function notifyProjectChatChanged(userId: string, projectId: string) {
  publishProjectChatChanged(userId, projectId).catch(() => undefined)
}
