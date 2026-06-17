import { NextRequest, NextResponse } from 'next/server'

import { elapsedSince, logAgentRun } from '@/server/agent/run-logger'
import { authenticatePersonalMcpRequest } from './personal/context'
import { handleJsonRpcMessage } from './personal/handlers'
import { corsHeaders, jsonResponse } from './personal/http'
import { type JsonRpcRequest } from './personal/schema'

export const runtime = 'nodejs'

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  })
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
  )
}

export async function handlePersonalMcpPost(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = crypto.randomUUID()
  const authStartedAt = Date.now()
  const context = await authenticatePersonalMcpRequest(request)
  logAgentRun(
    'mcp.personal.auth.finished',
    {
      requestId
    },
    {
      authElapsedMs: elapsedSince(authStartedAt),
      elapsedMs: elapsedSince(startedAt),
      ok: Boolean(context)
    }
  )

  if (!context) {
    logAgentRun(
      'mcp.personal.finished',
      {
        requestId
      },
      {
        elapsedMs: elapsedSince(startedAt),
        status: 401
      }
    )
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
    )
  }

  const parseStartedAt = Date.now()
  const payload = (await request.json().catch(() => null)) as
    | JsonRpcRequest
    | JsonRpcRequest[]
    | null
  logAgentRun(
    'mcp.personal.payload.parsed',
    {
      requestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      isBatch: Array.isArray(payload),
      parseElapsedMs: elapsedSince(parseStartedAt),
      requestCount: Array.isArray(payload) ? payload.length : payload ? 1 : 0
    }
  )

  if (!payload) {
    logAgentRun(
      'mcp.personal.finished',
      {
        requestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        status: 400
      }
    )
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
    )
  }

  if (Array.isArray(payload)) {
    const responses = (
      await Promise.all(
        payload.map((message, index) =>
          handleJsonRpcMessage(message, context, {
            index,
            parentRequestId: requestId,
            postStartedAt: startedAt
          })
        )
      )
    ).filter(Boolean)
    logAgentRun(
      'mcp.personal.finished',
      {
        requestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        responseCount: responses.length,
        status: responses.length > 0 ? 200 : 202
      }
    )

    return responses.length > 0
      ? jsonResponse(responses)
      : new Response(null, { status: 202, headers: corsHeaders() })
  }

  const response = await handleJsonRpcMessage(payload, context, {
    parentRequestId: requestId,
    postStartedAt: startedAt
  })
  logAgentRun(
    'mcp.personal.finished',
    {
      requestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      responseCount: response ? 1 : 0,
      status: response ? 200 : 202
    }
  )

  return response
    ? jsonResponse(response)
    : new Response(null, { status: 202, headers: corsHeaders() })
}
