export type JsonRpcRequest = {
  id?: string | number | null
  jsonrpc?: '2.0'
  method?: string
  params?: unknown
}

export type TokenUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export type McpContext = {
  tokenId: string
  user: {
    id: string
    email: string
    username: string
    name: string | null
  }
}

export type ToolCallParams = {
  name?: string
  arguments?: unknown
}

export type AskAppAgentArguments = {
  appId?: string
  message?: string
}

export type AppCatalogArguments = {
  appId?: string
  category?: string
  intent?: string
  query?: string
  reason?: string
}

export const personalMcpProtocolVersion = '2025-06-18'
