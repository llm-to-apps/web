import { NextResponse } from 'next/server'

import {
  apiResponseFromResult,
  appErrorStatus,
  type AppError,
  type AppResult
} from '@/shared/result'
import { schemaErrorMessage } from '@/shared/schema'

export type PublicApiSuccess<T extends Record<string, unknown> = Record<string, never>> =
  {
    ok: true
  } & T

export type PublicApiError = {
  ok: false
  message: string
  code?: AppError['code']
}

export type PublicApiResponse<T extends Record<string, unknown> = Record<string, never>> =
  | PublicApiSuccess<T>
  | PublicApiError

export function jsonOk<T extends Record<string, unknown> = Record<string, never>>(
  data?: T,
  init?: ResponseInit
) {
  return NextResponse.json<PublicApiSuccess<T>>(
    {
      ok: true,
      ...(data ?? ({} as T))
    },
    init
  )
}

export function jsonErrorMessage(
  message: string,
  status: number,
  code?: AppError['code']
) {
  return NextResponse.json<PublicApiError>(
    {
      ok: false,
      message,
      ...(code ? { code } : {})
    },
    {
      status
    }
  )
}

export function jsonValidationError(error: unknown) {
  return jsonErrorMessage(schemaErrorMessage(error), 400)
}

export function jsonError(error: AppError) {
  return NextResponse.json(apiResponseFromResult(error), {
    status: appErrorStatus(error.code)
  })
}

export function jsonResult<T>(result: AppResult<T>) {
  if (!result.ok) {
    return jsonError(result)
  }

  return NextResponse.json(apiResponseFromResult(result))
}
