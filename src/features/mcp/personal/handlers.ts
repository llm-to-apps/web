import { elapsedSince, logAgentRun, warnAgentRun } from '@/server/agent/run-logger'
import { askAppAgent } from './ask-app-agent'
import { jsonRpcError, jsonRpcResult } from './http'
import {
  type JsonRpcRequest,
  type McpContext,
  personalMcpProtocolVersion,
  type ToolCallParams
} from './schema'
import { listPersonalAppsTool } from './list-apps'
import { searchUploadedFilesTool } from './search-uploaded-files'
import { personalOsTools, toolJson } from './tools'
import { getUsageSummaryTool } from './usage-summary'

export async function handleJsonRpcMessage(
  request: JsonRpcRequest,
  context: McpContext,
  logContext: {
    index?: number
    parentRequestId: string
    postStartedAt: number
  }
) {
  const startedAt = Date.now()
  const id = request.id ?? null
  const messageRequestId = `${logContext.parentRequestId}${logContext.index === undefined ? '' : `:${logContext.index}`}`

  logAgentRun(
    'mcp.personal.message.started',
    {
      requestId: messageRequestId,
      userId: context.user.id
    },
    {
      id,
      method: request.method ?? null,
      postElapsedMs: elapsedSince(logContext.postStartedAt)
    }
  )

  if (!request.method) {
    logAgentRun(
      'mcp.personal.message.finished',
      {
        requestId: messageRequestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        method: null,
        status: 'invalid_request'
      }
    )
    return jsonRpcError(id, -32600, 'Invalid request')
  }

  if (request.method.startsWith('notifications/')) {
    logAgentRun(
      'mcp.personal.message.finished',
      {
        requestId: messageRequestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        method: request.method,
        status: 'notification'
      }
    )
    return null
  }

  if (request.method === 'initialize') {
    logAgentRun(
      'mcp.personal.message.finished',
      {
        requestId: messageRequestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        method: request.method,
        status: 'ok'
      }
    )
    return jsonRpcResult(id, {
      protocolVersion: personalMcpProtocolVersion,
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'os7-personal-mcp',
        version: '0.1.0'
      }
    })
  }

  if (request.method === 'tools/list') {
    logAgentRun(
      'mcp.personal.message.finished',
      {
        requestId: messageRequestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        method: request.method,
        status: 'ok',
        toolCount: personalOsTools().length
      }
    )
    return jsonRpcResult(id, {
      tools: personalOsTools()
    })
  }

  if (request.method === 'tools/call') {
    const params = request.params as ToolCallParams
    const result = await callTool(params, context, {
      parentRequestId: messageRequestId,
      postStartedAt: logContext.postStartedAt
    })
    logAgentRun(
      'mcp.personal.message.finished',
      {
        requestId: messageRequestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        method: request.method,
        status: 'ok',
        toolName: params.name ?? null
      }
    )
    return jsonRpcResult(id, result)
  }

  logAgentRun(
    'mcp.personal.message.finished',
    {
      requestId: messageRequestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      method: request.method,
      status: 'method_not_found'
    }
  )
  return jsonRpcError(id, -32601, `Method not found: ${request.method}`)
}

async function callTool(
  params: ToolCallParams,
  context: McpContext,
  logContext: {
    parentRequestId: string
    postStartedAt: number
  }
) {
  const startedAt = Date.now()
  const requestId = `${logContext.parentRequestId}:${params.name ?? 'unknown_tool'}`
  logAgentRun(
    'mcp.personal.tool.started',
    {
      requestId,
      userId: context.user.id
    },
    {
      postElapsedMs: elapsedSince(logContext.postStartedAt),
      toolName: params.name ?? null
    }
  )

  if (params.name === 'list_apps') {
    return listPersonalAppsTool({
      context,
      requestId,
      startedAt,
      toolName: params.name
    })
  }

  if (params.name === 'get_usage_summary') {
    return getUsageSummaryTool({
      context,
      requestId,
      startedAt,
      toolName: params.name
    })
  }

  if (params.name === 'search_uploaded_files') {
    return searchUploadedFilesTool({
      args: params.arguments,
      context,
      requestId,
      startedAt,
      toolName: params.name
    })
  }

  if (params.name === 'ask_app_agent') {
    const result = await askAppAgent(params.arguments, context, {
      parentRequestId: requestId,
      postStartedAt: logContext.postStartedAt
    })
    logAgentRun(
      'mcp.personal.tool.finished',
      {
        requestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        ok: result.ok,
        toolName: params.name
      }
    )
    return toolJson(result)
  }

  warnAgentRun(
    'mcp.personal.tool.unknown',
    {
      requestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      toolName: params.name ?? null
    }
  )
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Unknown tool: ${params.name ?? 'missing'}`
      }
    ]
  }
}
