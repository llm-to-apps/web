import { NextResponse } from 'next/server'

import { type JsonRpcRequest } from './schema'

export function jsonRpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return {
    jsonrpc: '2.0',
    id,
    result
  }
}

export function jsonRpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders()
  })
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  }
}
