import { type NextRequest } from 'next/server'
import { z } from 'zod'

export const optionalStringSchema = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value : null))

export const requiredStringSchema = (name: string) =>
  z.unknown().transform((value, ctx) => {
    const text = typeof value === 'string' ? value.trim() : ''

    if (!text) {
      ctx.addIssue({
        code: 'custom',
        message: `${name} is required`
      })

      return z.NEVER
    }

    return text
  })

export const optionalTrimmedStringSchema = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value.trim() : ''))

export function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)

  if (!result.success) {
    throw new SchemaValidationError(result.error.issues[0]?.message ?? 'Invalid input')
  }

  return result.data
}

export async function parseJsonRequest<T>(
  request: NextRequest,
  schema: z.ZodType<T>
): Promise<T> {
  const input = await request.json().catch(() => null)

  return parseWithSchema(schema, input)
}

export function parseObjectInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }

  return input as Record<string, unknown>
}

export class SchemaValidationError extends Error {
  readonly status = 400

  constructor(message = 'Invalid input') {
    super(message)
    this.name = 'SchemaValidationError'
  }
}

export function schemaErrorMessage(error: unknown, fallback = 'Invalid input') {
  if (error instanceof SchemaValidationError || error instanceof z.ZodError) {
    return error.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
