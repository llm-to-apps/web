import { type AgentStreamEvent, type TokenUsage } from './run-types'
import { type Prisma } from '@prisma/client'

export type MastraStreamHandlers = {
  onChunk?: (chunk: { bytes: number }) => void
  onEvent: (event: AgentStreamEvent) => Promise<void> | void
  onUsage?: (usage: TokenUsage) => void
}

export async function readMastraStream(
  body: ReadableStream<Uint8Array>,
  handlers: MastraStreamHandlers
) {
  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''
  let tokenUsage: TokenUsage = {}

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      handlers.onChunk?.({ bytes: value.byteLength })
      buffer += decoder.decode(value, { stream: true })
      buffer = await flushSseBuffer(buffer, handlers.onEvent, (usage) => {
        tokenUsage = mergeTokenUsage(tokenUsage, usage)
        handlers.onUsage?.(tokenUsage)
      })
    }

    buffer += decoder.decode()
    await flushSseBuffer(`${buffer}\n\n`, handlers.onEvent, (usage) => {
      tokenUsage = mergeTokenUsage(tokenUsage, usage)
      handlers.onUsage?.(tokenUsage)
    })

    return tokenUsage
  } finally {
    reader.releaseLock()
  }
}

async function flushSseBuffer(
  buffer: string,
  writeEvent: (event: AgentStreamEvent) => Promise<void> | void,
  recordUsage: (usage: TokenUsage) => void
) {
  const parts = buffer.split(/\r?\n\r?\n/)
  const remainder = parts.pop() ?? ''

  for (const part of parts) {
    await handleSseEvent(part, writeEvent, recordUsage)
  }

  return remainder
}

async function handleSseEvent(
  eventBlock: string,
  writeEvent: (event: AgentStreamEvent) => Promise<void> | void,
  recordUsage: (usage: TokenUsage) => void
) {
  const data = eventBlock
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')

  if (!data || data === '[DONE]') {
    return
  }

  const parsed = parseJson(data)

  if (!parsed) {
    await writeEvent({ type: 'text', text: data })
    return
  }

  const usage = extractTokenUsage(parsed)
  if (hasTokenUsage(usage)) {
    recordUsage(usage)
  }

  for (const event of mapMastraStreamEvent(parsed)) {
    await writeEvent(event)
  }
}

export function mergeTokenUsage(
  currentUsage: TokenUsage,
  nextUsage: TokenUsage
): TokenUsage {
  return {
    completionTokens: nextUsage.completionTokens ?? currentUsage.completionTokens,
    promptTokens: nextUsage.promptTokens ?? currentUsage.promptTokens,
    totalTokens: nextUsage.totalTokens ?? currentUsage.totalTokens
  }
}

export function hasTokenUsage(usage: TokenUsage) {
  return (
    typeof usage.completionTokens === 'number' ||
    typeof usage.promptTokens === 'number' ||
    typeof usage.totalTokens === 'number'
  )
}

function extractTokenUsage(chunk: unknown): TokenUsage {
  if (!isObjectRecord(chunk)) {
    return {}
  }

  const usageSource = findUsageObject(chunk)
  if (!usageSource) {
    return {}
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
  }
}

function findUsageObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedUsage = findUsageObject(item)

      if (nestedUsage) {
        return nestedUsage
      }
    }

    return null
  }

  if (!isObjectRecord(value)) {
    return null
  }

  if (isUsageLike(value)) {
    return value
  }

  for (const key of [
    'usage',
    'totalUsage',
    'stepUsage',
    'payload',
    'data',
    'output',
    'steps'
  ]) {
    const nestedUsage = findUsageObject(value[key])

    if (nestedUsage) {
      return nestedUsage
    }
  }

  return null
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
  ].some((key) => typeof value[key] === 'number')
}

function readNumberField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return undefined
}

function mapMastraStreamEvent(chunk: unknown): AgentStreamEvent[] {
  if (!isObjectRecord(chunk)) {
    return []
  }

  const type = typeof chunk.type === 'string' ? chunk.type : ''
  const text = extractStreamText(chunk)

  if (text) {
    return [{ type: 'text', text }]
  }

  if (type === 'tool-call') {
    const toolName = extractToolName(chunk) ?? 'tool'
    const toolInput = toJsonInputValue(parsePossiblyJson(extractToolInput(chunk)))

    return [
      {
        type: 'progress',
        message: formatToolProgressMessage('Running', toolName, toolInput),
        ...(toolInput === undefined ? {} : { toolInput }),
        toolName,
        toolState: 'running'
      }
    ]
  }

  if (type === 'tool-result' || type === 'tool-output') {
    const toolName = extractToolName(chunk) ?? 'tool'
    const toolOutput = toJsonInputValue(parsePossiblyJson(extractToolOutput(chunk)))

    return [
      {
        type: 'progress',
        message: formatToolProgressMessage('Finished', toolName, toolOutput),
        ...(toolOutput === undefined ? {} : { toolInput: toolOutput }),
        toolName,
        toolState: 'finished'
      }
    ]
  }

  if (type === 'error') {
    return [
      {
        type: 'error',
        message: extractErrorMessage(chunk)
      }
    ]
  }

  return []
}

function extractStreamText(chunk: Record<string, unknown>) {
  for (const key of ['textDelta', 'delta', 'text']) {
    const value = chunk[key]

    if (typeof value === 'string' && value) {
      return value
    }
  }

  const payload = chunk.payload

  if (isObjectRecord(payload)) {
    for (const key of ['textDelta', 'delta', 'text']) {
      const value = payload[key]

      if (typeof value === 'string' && value) {
        return value
      }
    }
  }

  return ''
}

function formatToolProgressMessage(
  action: 'Running' | 'Finished',
  toolName: string,
  value: unknown
) {
  const details =
    action === 'Running' ? summarizeToolInput(value) : summarizeToolOutput(value)

  return details ? `${action} ${toolName}\n${details}` : `${action} ${toolName}`
}

function extractToolName(chunk: Record<string, unknown>) {
  for (const key of ['toolName', 'name']) {
    const value = chunk[key]

    if (typeof value === 'string' && value) {
      return value
    }
  }

  for (const nestedKey of ['toolCall', 'toolCallDelta', 'payload']) {
    const value = chunk[nestedKey]

    if (isObjectRecord(value) && typeof value.toolName === 'string') {
      return value.toolName
    }
  }

  return null
}

function extractToolInput(chunk: Record<string, unknown>): unknown {
  return firstKnownValue(chunk, [
    'args',
    'input',
    'toolInput',
    'toolArgs',
    'arguments',
    'inputData'
  ])
}

function extractToolOutput(chunk: Record<string, unknown>): unknown {
  return firstKnownValue(chunk, [
    'result',
    'output',
    'toolResult',
    'toolOutput',
    'content',
    'data'
  ])
}

function firstKnownValue(chunk: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = chunk[key]

    if (value !== undefined) {
      return value
    }
  }

  for (const nestedKey of ['payload', 'toolCall', 'toolCallDelta', 'toolInvocation']) {
    const value = chunk[nestedKey]

    if (isObjectRecord(value)) {
      const nestedValue = firstKnownValue(value, keys)

      if (nestedValue !== undefined) {
        return nestedValue
      }
    }
  }

  return undefined
}

function summarizeToolInput(input: unknown) {
  const parsedInput = parsePossiblyJson(input)

  if (!isObjectRecord(parsedInput)) {
    return summarizeUnknownValue(parsedInput)
  }

  const lines: string[] = []

  appendField(lines, parsedInput, 'command')
  appendField(lines, parsedInput, 'cwd')
  appendField(lines, parsedInput, 'path')
  appendField(lines, parsedInput, 'name')
  appendField(lines, parsedInput, 'search')
  appendField(lines, parsedInput, 'replace')
  appendField(lines, parsedInput, 'expectedReplacements')
  appendField(lines, parsedInput, 'query')
  appendField(lines, parsedInput, 'maxDepth')
  appendField(lines, parsedInput, 'tail')

  const changes = parsedInput.changes

  if (Array.isArray(changes)) {
    lines.push(`changes: ${changes.length}`)
  }

  if (isObjectRecord(parsedInput.arguments)) {
    lines.push(`arguments: ${truncateText(JSON.stringify(parsedInput.arguments), 260)}`)
  }

  return lines.length > 0 ? lines.join('\n') : summarizeUnknownValue(parsedInput)
}

function summarizeToolOutput(output: unknown) {
  const parsedOutput = parsePossiblyJson(output)

  if (!isObjectRecord(parsedOutput)) {
    return summarizeUnknownValue(parsedOutput)
  }

  const lines: string[] = []

  appendField(lines, parsedOutput, 'path')
  appendField(lines, parsedOutput, 'exitCode')
  appendField(lines, parsedOutput, 'status')
  appendField(lines, parsedOutput, 'ok')

  const entries = parsedOutput.entries

  if (Array.isArray(entries)) {
    lines.push(`entries: ${entries.length}`)
  }

  appendTextPreview(lines, parsedOutput, 'stdout')
  appendTextPreview(lines, parsedOutput, 'stderr')
  appendTextPreview(lines, parsedOutput, 'content')

  return lines.length > 0 ? lines.join('\n') : summarizeUnknownValue(parsedOutput)
}

function appendField(lines: string[], record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    lines.push(`${key}: ${truncateText(String(value), 180)}`)
  }
}

function appendTextPreview(
  lines: string[],
  record: Record<string, unknown>,
  key: string
) {
  const value = record[key]

  if (typeof value === 'string' && value.trim()) {
    lines.push(`${key}: ${truncateText(value.trim(), 260)}`)
  }
}

function parsePossiblyJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  const trimmedValue = value.trim()

  if (!trimmedValue.startsWith('{') && !trimmedValue.startsWith('[')) {
    return value
  }

  return parseJson(trimmedValue) ?? value
}

function toJsonInputValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function summarizeUnknownValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return ''
  }

  if (typeof value === 'string') {
    return truncateText(value, 260)
  }

  return truncateText(JSON.stringify(value, null, 2), 360)
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}

function extractErrorMessage(chunk: Record<string, unknown>) {
  const error = chunk.error

  if (typeof error === 'string') {
    return error
  }

  if (isObjectRecord(error) && typeof error.message === 'string') {
    return error.message
  }

  return 'Agent stream returned an error.'
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
