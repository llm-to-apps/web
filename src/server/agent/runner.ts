import { type Prisma } from '@prisma/client'

import { prisma } from '../db'
import { recordAgentRunEvent } from './run-events'
import {
  type AgentMode,
  type AgentStreamEvent,
  type ProjectAgentRunPayload,
  type TokenUsage,
  type UserAgentRunPayload
} from './run-types'
import { ensureAuthToken } from '../auth/tokens'
import { billAgentUsage } from '../billing'
import { hasTokenUsage, readMastraStream } from './mastra-stream'
import { publishProjectChatChanged } from './project-chat-events'
import {
  agentRuntimeUrl,
  projectDevAgentModel,
  projectUseAgentModel,
  userAgentModel
} from '../env'
import { platformBaseUrl } from '../request-origin'
import { projectAgentMemoryIds, userAgentMemoryIds } from './memory-ids'
import { elapsedSince, errorAgentRun, logAgentRun, truncateForLog } from './run-logger'

type AgentRunRecord = {
  id: string
  inputMessageId: string | null
  mode: string
  model: string | null
  payload: Prisma.JsonValue
  projectId: string | null
  requestId: string
  scope: string
  user: {
    email: string
    id: string
  }
  userId: string
}

class AgentUserFacingError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string
  ) {
    super(message)
    this.name = 'AgentUserFacingError'
  }
}

export async function executeAgentRun(runId: string) {
  const workerStartedAt = Date.now()
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      inputMessageId: true,
      mode: true,
      model: true,
      payload: true,
      projectId: true,
      requestId: true,
      scope: true,
      user: {
        select: {
          email: true,
          id: true
        }
      },
      userId: true
    }
  })

  if (!run) {
    throw new Error(`Agent run ${runId} not found`)
  }

  logAgentRun('worker.loaded_run', runLogContext(run), {
    workerLoadElapsedMs: elapsedSince(workerStartedAt)
  })

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      startedAt: new Date(),
      status: 'running'
    }
  })
  logAgentRun('run.status.running', runLogContext(run), {
    workerElapsedMs: elapsedSince(workerStartedAt)
  })

  try {
    if (run.scope === 'user_agent') {
      await executeUserAgentRun(run)
      return
    }

    if (run.scope === 'project_agent') {
      await executeProjectAgentRun(run)
      return
    }

    throw new Error(`Unknown agent run scope: ${run.scope}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent run failed'
    const userMessage = userFacingAgentErrorMessage(error)

    errorAgentRun('run.failed', runLogContext(run), {
      error: message,
      userMessage,
      workerElapsedMs: elapsedSince(workerStartedAt)
    })
    await emitRunEvent(run.id, {
      type: 'error',
      message: userMessage
    })
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        error: userMessage,
        status: 'failed'
      }
    })
    throw error
  }
}

async function executeUserAgentRun(run: AgentRunRecord) {
  const startedAt = Date.now()
  const payload = readUserAgentPayload(run.payload)
  const agentUrl = requireAgentUrl()
  const agentModel = run.model ?? userAgentModel()
  const streamUrl = `${agentUrl}/api/agents/userAgent/stream`
  const { resourceId: memoryResource, threadId: memoryThreadId } = userAgentMemoryIds(
    run.userId
  )
  const personalMcpToken = await ensureAuthToken({
    userId: run.userId,
    subjectType: 'user',
    scope: 'personal:mcp',
    name: 'Personal OS MCP'
  })
  logAgentRun('user_agent.prepared', runLogContext(run), {
    elapsedMs: elapsedSince(startedAt),
    messageLength: payload.message.length,
    model: agentModel
  })

  await runMastraStream({
    body: {
      messages: [
        {
          role: 'user',
          content: payload.message
        }
      ],
      sendUsage: true,
      memory: {
        resource: memoryResource,
        thread: {
          id: memoryThreadId,
          title: 'User agent main chat',
          metadata: {
            userEmail: run.user.email,
            userId: run.userId
          }
        }
      },
      instructions: userAgentInstructions(run.userId, run.user.email),
      maxSteps: 20,
      modelSettings: {
        temperature: 0.2
      },
      requestContext: {
        model: agentModel,
        personalMcpToken: personalMcpToken.token,
        personalMcpUrl: payload.personalMcpUrl,
        requestId: run.requestId,
        userEmail: run.user.email,
        userId: run.userId
      }
    },
    model: agentModel,
    run,
    streamUrl
  })
}

async function executeProjectAgentRun(run: AgentRunRecord) {
  const startedAt = Date.now()
  const payload = readProjectAgentPayload(run.payload)
  const mode = normalizeMode(run.mode)
  const agentUrl = requireAgentUrl()
  const agentId = mode === 'dev' ? 'projectDevAgent' : 'projectUseAgent'
  const agentModel =
    run.model ?? (mode === 'dev' ? projectDevAgentModel() : projectUseAgentModel())
  const streamUrl = `${agentUrl}/api/agents/${agentId}/stream`
  const { resourceId: memoryResource, threadId: memoryThreadId } = projectAgentMemoryIds(
    run.userId,
    run.projectId ?? '',
    mode
  )
  logAgentRun('project_agent.prepared', runLogContext(run), {
    elapsedMs: elapsedSince(startedAt),
    messageLength: payload.message.length,
    mode,
    model: agentModel,
    mastraAgentId: agentId,
    projectStatus: payload.status
  })

  await runMastraStream({
    body: {
      messages: [
        {
          role: 'user',
          content: payload.message
        }
      ],
      sendUsage: true,
      memory: {
        resource: memoryResource,
        thread: {
          id: memoryThreadId,
          title: `${payload.projectName} main chat`,
          metadata: {
            projectDomain: payload.domain,
            projectId: run.projectId,
            templateName: payload.projectName,
            userId: run.userId
          }
        }
      },
      instructions: projectAgentInstructions({
        appMcpUrl: payload.appMcpUrl,
        domain: payload.domain,
        mode,
        projectId: run.projectId ?? '',
        projectName: payload.projectName,
        status: payload.status,
        toolsUrl: payload.toolsUrl
      }),
      maxSteps: 50,
      modelSettings: {
        temperature: 0.2
      },
      requestContext: {
        agentToolsToken: mode === 'dev' ? payload.agentToolsToken : undefined,
        appMcpUrl: mode === 'use' ? payload.appMcpUrl : undefined,
        mode,
        model: agentModel,
        mastraAgentId: agentId,
        projectDomain: payload.domain,
        projectId: run.projectId,
        projectStatus: payload.status,
        projectUserToken: mode === 'use' ? payload.projectUserToken : undefined,
        requestId: run.requestId,
        toolsUrl: mode === 'dev' ? payload.toolsUrl : undefined
      }
    },
    model: agentModel,
    run,
    streamUrl
  })
}

async function runMastraStream({
  body,
  model,
  run,
  streamUrl
}: {
  body: Record<string, unknown>
  model: string
  run: AgentRunRecord
  streamUrl: string
}) {
  let assistantContent = ''
  let assistantError = ''
  let tokenUsage: TokenUsage = {}
  let eventCount = 0
  let firstChunkAt: number | null = null
  let firstTextAt: number | null = null
  let textChars = 0
  const streamStartedAt = Date.now()
  const context = runLogContext(run)

  logAgentRun('mastra.run.started', context, {
    model,
    streamUrl
  })
  await emitRunEvent(run.id, {
    type: 'progress',
    message: 'Agent started'
  })
  logAgentRun('mastra.fetch.started', context, {
    elapsedMs: elapsedSince(streamStartedAt),
    model
  })

  let response: Response

  try {
    response = await fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Agent request failed before response'
    throw new AgentUserFacingError(message, "Can't start agent")
  }
  logAgentRun('mastra.response.headers', context, {
    elapsedMs: elapsedSince(streamStartedAt),
    ok: response.ok,
    status: response.status
  })

  if (!response.ok || !response.body) {
    throw new AgentUserFacingError(
      `Agent request failed with ${response.status}`,
      "Can't start agent"
    )
  }

  tokenUsage = await readMastraStream(response.body, {
    onChunk: ({ bytes }) => {
      if (firstChunkAt) {
        return
      }

      firstChunkAt = Date.now()
      logAgentRun('mastra.first_chunk', context, {
        bytes,
        elapsedMs: firstChunkAt - streamStartedAt
      })
    },
    onEvent: async (event) => {
      eventCount++
      if (event.type === 'text') {
        assistantContent += event.text
        textChars += event.text.length

        if (!firstTextAt) {
          firstTextAt = Date.now()
          logAgentRun('mastra.first_text', context, {
            elapsedMs: firstTextAt - streamStartedAt,
            preview: truncateForLog(event.text.replace(/\s+/g, ' '))
          })
        }
      }

      if (event.type === 'error') {
        assistantError += assistantError ? `\n${event.message}` : event.message
      }

      await emitRunEvent(run.id, event)
      if (event.type === 'progress' || event.type === 'error' || event.type === 'usage') {
        logAgentRun('mastra.event.forwarded', context, {
          elapsedMs: elapsedSince(streamStartedAt),
          eventCount,
          eventType: event.type
        })
      }
    },
    onUsage: (usage) => {
      tokenUsage = usage
    }
  })

  if (hasTokenUsage(tokenUsage)) {
    await emitRunEvent(run.id, {
      type: 'usage',
      usage: tokenUsage
    })
  }

  const assistantMessageId = await persistAssistantMessage(
    run,
    assistantContent || assistantError
  )
  logAgentRun('message.persisted', context, {
    assistantMessageId,
    contentLength: (assistantContent || assistantError).trim().length,
    elapsedMs: elapsedSince(streamStartedAt)
  })

  const creditUsage =
    run.scope === 'project_agent'
      ? await persistProjectAgentUsage(run, model, tokenUsage, assistantMessageId)
      : await persistUserAgentUsage(run, model, tokenUsage, assistantMessageId)

  if (creditUsage) {
    await emitRunEvent(run.id, {
      type: 'credits',
      creditsUsed: creditUsage.creditsUsed
    })
  }

  await emitRunEvent(run.id, {
    type: 'done'
  })
  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      completedAt: new Date(),
      model,
      outputMessageId: assistantMessageId,
      status: 'completed'
    }
  })
  logAgentRun('run.completed', context, {
    assistantMessageId,
    elapsedMs: elapsedSince(streamStartedAt),
    eventCount,
    textChars,
    usage: tokenUsage
  })
}

async function emitRunEvent(runId: string, event: AgentStreamEvent) {
  await recordAgentRunEvent(runId, event)
}

function userFacingAgentErrorMessage(error: unknown) {
  if (error instanceof AgentUserFacingError) {
    return error.userMessage
  }

  return error instanceof Error ? error.message : 'Agent run failed'
}

async function persistAssistantMessage(run: AgentRunRecord, content: string) {
  const trimmedContent = content.trim()

  if (!trimmedContent) {
    return null
  }

  if (run.scope === 'user_agent') {
    const message = await prisma.userAgentChatMessage.create({
      data: {
        content: trimmedContent,
        role: 'assistant',
        userId: run.userId
      }
    })

    return message.id
  }

  const message = await prisma.projectAgentChatMessage.create({
    data: {
      content: trimmedContent,
      mode: normalizeMode(run.mode),
      projectId: run.projectId ?? '',
      role: 'assistant',
      source: 'project_agent',
      userId: run.userId
    }
  })
  publishProjectChatChanged(run.userId, run.projectId ?? '').catch(() => undefined)

  return message.id
}

async function persistProjectAgentUsage(
  run: AgentRunRecord,
  model: string,
  usage: TokenUsage,
  assistantMessageId: string | null
) {
  if (!run.projectId) {
    return null
  }

  await prisma.agentUsage.upsert({
    where: {
      requestId: run.requestId
    },
    update: {
      assistantMessageId,
      completionTokens: usage.completionTokens ?? null,
      model,
      promptTokens: usage.promptTokens ?? null,
      totalTokens: usage.totalTokens ?? null
    },
    create: {
      assistantMessageId,
      completionTokens: usage.completionTokens ?? null,
      mode: normalizeMode(run.mode),
      model,
      projectId: run.projectId,
      promptTokens: usage.promptTokens ?? null,
      requestId: run.requestId,
      totalTokens: usage.totalTokens ?? null,
      userId: run.userId,
      userMessageId: run.inputMessageId
    }
  })
  const billingEntry = await billAgentUsage({
    actorUserId: run.userId,
    model,
    projectId: run.projectId,
    requestId: run.requestId,
    usage
  })
  logAgentRun('usage.persisted', runLogContext(run), {
    assistantMessageId,
    usage
  })
  return formatCreditUsage(billingEntry?.credits)
}

async function persistUserAgentUsage(
  run: AgentRunRecord,
  model: string,
  usage: TokenUsage,
  assistantMessageId: string | null
) {
  await prisma.agentUsage.upsert({
    where: {
      requestId: run.requestId
    },
    update: {
      assistantMessageId,
      completionTokens: usage.completionTokens ?? null,
      model,
      promptTokens: usage.promptTokens ?? null,
      totalTokens: usage.totalTokens ?? null
    },
    create: {
      assistantMessageId,
      completionTokens: usage.completionTokens ?? null,
      mode: normalizeMode(run.mode),
      model,
      projectId: run.projectId,
      promptTokens: usage.promptTokens ?? null,
      requestId: run.requestId,
      totalTokens: usage.totalTokens ?? null,
      userId: run.userId,
      userMessageId: run.inputMessageId
    }
  })
  const billingEntry = await billAgentUsage({
    actorUserId: run.userId,
    model,
    projectId: null,
    requestId: run.requestId,
    usage
  })
  logAgentRun('usage.persisted', runLogContext(run), {
    assistantMessageId,
    usage
  })
  return formatCreditUsage(billingEntry?.credits)
}

function formatCreditUsage(value: unknown) {
  const numericValue = Number(value ?? 0)
  const creditsUsed = Math.ceil(Math.abs(Math.min(numericValue, 0)))

  if (creditsUsed <= 0) {
    return null
  }

  return {
    creditsUsed
  }
}

function runLogContext(run: AgentRunRecord) {
  return {
    projectId: run.projectId,
    requestId: run.requestId,
    runId: run.id,
    scope: run.scope,
    userId: run.userId
  }
}

function requireAgentUrl() {
  const agentUrl = agentRuntimeUrl()

  if (!agentUrl) {
    throw new Error('The agent runtime is not connected yet')
  }

  return agentUrl
}

function normalizeMode(mode: string): AgentMode {
  return mode === 'dev' ? 'dev' : 'use'
}

function readUserAgentPayload(payload: Prisma.JsonValue): UserAgentRunPayload {
  if (!isObjectRecord(payload) || typeof payload.message !== 'string') {
    throw new Error('Invalid user agent run payload')
  }

  return {
    message: payload.message,
    personalMcpUrl:
      typeof payload.personalMcpUrl === 'string'
        ? payload.personalMcpUrl
        : defaultPersonalMcpUrl(),
    userEmail: typeof payload.userEmail === 'string' ? payload.userEmail : ''
  }
}

function readProjectAgentPayload(payload: Prisma.JsonValue): ProjectAgentRunPayload {
  if (
    !isObjectRecord(payload) ||
    typeof payload.message !== 'string' ||
    typeof payload.domain !== 'string' ||
    typeof payload.projectName !== 'string' ||
    typeof payload.status !== 'string' ||
    typeof payload.toolsUrl !== 'string' ||
    typeof payload.appMcpUrl !== 'string'
  ) {
    throw new Error('Invalid project agent run payload')
  }

  return {
    agentToolsToken:
      typeof payload.agentToolsToken === 'string' ? payload.agentToolsToken : null,
    appMcpUrl: payload.appMcpUrl,
    domain: payload.domain,
    message: payload.message,
    projectUserToken:
      typeof payload.projectUserToken === 'string' ? payload.projectUserToken : null,
    projectName: payload.projectName,
    status: payload.status,
    toolsUrl: payload.toolsUrl
  }
}

function defaultPersonalMcpUrl() {
  return new URL('/api/mcp/personal', platformBaseUrl()).toString()
}

function userAgentInstructions(userId: string, userEmail: string) {
  return `
You are working for user ${userId}.
User email: ${userEmail}

Rules:
- You are the os7 user agent for this signed-in user.
- Do not call yourself an orchestrator.
- Answer once. Do not repeat the same sentence.
- You are on the /home screen, where the user sees their installed apps.
- Personal OS MCP is available in request context as personalMcpUrl and personalMcpToken.
- Use Personal OS MCP tools to list apps, inspect usage, and delegate app-specific Use mode work to app agents.
- If a Personal OS MCP tool returns "I see these installed apps (N)" where N is greater than 0, copy that list to the user. Never say the app list is empty in that case.
- Do not claim to know the user's current project list unless it is provided in this request or by a tool.
- If the user asks for work inside a specific app, identify the target app and explain that the project agent should handle the app-specific work.
- If the target app is unclear, ask one concise question.
- If a requested platform action requires a missing tool, say which capability is not connected yet.
- Mastra memory may provide prior conversation context. Treat it as helpful context, not proof of current projects, files, runtime state, or app data.
`
}

function projectAgentInstructions({
  appMcpUrl,
  domain,
  mode,
  projectId,
  projectName,
  status,
  toolsUrl
}: {
  appMcpUrl: string
  domain: string
  mode: AgentMode
  projectId: string
  projectName: string
  status: string
  toolsUrl: string
}) {
  return `
You are working on project ${projectId}.
Application: ${projectName}
Domain: ${domain}
Status: ${status}
Mode: ${mode === 'dev' ? 'Dev' : 'Use'}
${mode === 'dev' ? `Agent tools endpoint: ${toolsUrl}` : `Application MCP endpoint: ${appMcpUrl}`}

Rules:
- You are the os7 ${mode === 'dev' ? 'project development agent' : 'project use agent'} for this app, not the underlying model provider.
- Answer once. Do not repeat the same sentence.
${mode === 'dev' ? devModeRules() : projectUseModeRules()}
- Do not announce tool usage before calling a tool.
- After a tool result, answer with the result. Do not call the same tool twice with the same arguments.
- Do not say "let me check" unless you actually call a tool.
- Do not claim you changed files unless a tool call confirms it.
- When answering about application data, keep the answer concise and do not include internal IDs unless the user asks for them.
- Mastra memory may provide prior conversation context. Treat it as helpful context, not proof of current files, runtime state, or app data. Verify current facts with tools.
`
}

function projectUseModeRules() {
  return `- You are in Use mode.
- Use application MCP tools for app data operations: call listAppMcpTools when needed, then callAppMcpTool.
- Use the smallest number of app tool calls that can answer or complete the user's request.
- Return the business result in plain language. Do not dump raw tool JSON unless the user asks for it.
- Do not inspect or change source code.
- Do not use dev project tools, do not call project tools, and do not attempt to commit or push code changes.
- If the user asks to change UI, styles, source code, files, dependencies, runtime behavior, or developer configuration, stop and tell them to switch to Development mode to make that change.
- Do not offer to retry code changes from Use mode.`
}

function devModeRules() {
  return `- You are in Dev mode.
- Use agent dev tools for runtime facts, source inspection, code, UI, behavior, dependency, and file changes.
- Do not use application MCP tools.
- Classify the task before acting: inspect, edit, debug, verify, or explain.
- Before changing project code, database models, MCP tools, UI, dependencies, or files, attempt to read AGENT.md once with readProjectFile. If it exists, follow its project-specific rules. If it is missing, continue normally.
- Use the smallest workflow that can complete the task.
- After Prisma schema changes, run npm run prisma:generate and npm run typecheck, restart the app process, then inspect app status or logs.
- Do not intentionally edit generated framework files such as next-env.d.ts.
- Do not add UI or code fallbacks to hide missing required database tables or columns.
- For routine CRUD UI, preserve local screen state with client state, optimistic updates, or focused JSON refetches. Do not use full route refreshes, periodic whole-view polling, or browser reloads as the default mutation UX.
- Stop when the request is satisfied.`
}

function isObjectRecord(value: unknown): value is Record<string, Prisma.JsonValue> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
