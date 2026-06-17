export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'

export type AppError = {
  ok: false
  code: AppErrorCode
  message: string
  cause?: unknown
}

export type AppSuccess<T> = {
  ok: true
  data: T
}

export type AppResult<T> = AppSuccess<T> | AppError

export type AppResultResponse<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: {
        code: AppErrorCode
        message: string
      }
    }

export function appOk<T>(data: T): AppSuccess<T> {
  return {
    ok: true,
    data
  }
}

export function appError(code: AppErrorCode, message: string, cause?: unknown): AppError {
  return {
    ok: false,
    code,
    message,
    cause
  }
}

export function appErrorStatus(code: AppErrorCode) {
  switch (code) {
    case 'BAD_REQUEST':
      return 400
    case 'UNAUTHORIZED':
      return 401
    case 'FORBIDDEN':
      return 403
    case 'NOT_FOUND':
      return 404
    case 'CONFLICT':
      return 409
    case 'RATE_LIMITED':
      return 429
    case 'INTERNAL':
      return 500
  }
}

export function apiResponseFromResult<T>(result: AppResult<T>): AppResultResponse<T> {
  if (result.ok) {
    return {
      ok: true,
      data: result.data
    }
  }

  return {
    ok: false,
    error: {
      code: result.code,
      message: result.message
    }
  }
}
