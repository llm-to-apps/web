import { type TokenUsage } from './schema'

export function extractTokenUsage(chunk: unknown): TokenUsage {
  if (!isObjectRecord(chunk)) {
    return {}
  }

  const usage = findUsageObject(chunk)

  if (!usage) {
    return {}
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

function readNumberField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return undefined
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
