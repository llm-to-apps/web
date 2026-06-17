import type { AppError } from './result'

export type ApiSuccessResponse<T = Record<string, never>> = {
  ok: true
  data: T
}

export type ApiErrorResponse = {
  ok: false
  error: {
    code: AppError['code']
    message: string
  }
}

export type ApiResponse<T = Record<string, never>> =
  | ApiSuccessResponse<T>
  | ApiErrorResponse
