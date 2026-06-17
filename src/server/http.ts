import { NextResponse } from 'next/server'

import { appErrorStatus, type AppError, type AppResult } from '@/shared/result'
import {
  type ApiErrorResponse,
  type ApiResponse,
  type ApiSuccessResponse
} from '@/shared/api'
import { schemaErrorMessage } from '@/shared/schema'

export type { ApiErrorResponse, ApiResponse, ApiSuccessResponse }

export type PublicApiSuccess<T = Record<string, never>> = ApiSuccessResponse<T>
export type PublicApiError = ApiErrorResponse
export type PublicApiResponse<T = Record<string, never>> = ApiResponse<T>

export function jsonOk<T = Record<string, never>>(data = {} as T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccessResponse<T>>(
    {
      ok: true,
      data
    },
    init
  )
}

export function jsonErrorMessage(
  message: string,
  status: number,
  code?: AppError['code']
) {
  return NextResponse.json<ApiErrorResponse>(
    {
      ok: false,
      error: {
        code: code ?? appErrorCodeFromStatus(status),
        message
      }
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
  return jsonErrorMessage(error.message, appErrorStatus(error.code), error.code)
}

export function jsonResult<T extends Record<string, unknown>>(result: AppResult<T>) {
  if (!result.ok) {
    return jsonError(result)
  }

  return jsonOk(result.data)
}

function appErrorCodeFromStatus(status: number): AppError['code'] {
  switch (status) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 429:
      return 'RATE_LIMITED'
    default:
      return 'INTERNAL'
  }
}
