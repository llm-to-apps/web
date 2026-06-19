import { Prisma } from '@prisma/client'

import { prisma } from '@/server/db'

export const maxUsernameLength = 18
export const usernamePattern = /^[a-z0-9._]{1,18}$/

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

export function usernameValidationMessage(username: string) {
  if (!username) {
    return 'Username is required'
  }

  if (username.length > maxUsernameLength) {
    return `Username must be ${maxUsernameLength} characters or fewer`
  }

  if (!usernamePattern.test(username)) {
    return 'Username can use English letters, numbers, underscores, and dots only'
  }

  return null
}

export function usernameFromEmail(email: string) {
  const localPart = email.split('@')[0] ?? ''
  const normalized = localPart
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '.')
    .replace(/[._]{2,}/g, '.')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, maxUsernameLength)
    .replace(/[._]+$/g, '')

  return normalized || 'user'
}

export async function createAvailableUsernameFromEmail(email: string) {
  return findAvailableUsername(usernameFromEmail(email))
}

export async function withAvailableUsernameRetry<T>(
  email: string,
  createUser: (username: string) => Promise<T>
) {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = await createAvailableUsernameFromEmail(email)

    try {
      return await createUser(username)
    } catch (error) {
      if (!isUsernameUniqueConstraintError(error)) {
        throw error
      }

      lastError = error
    }
  }

  throw lastError ?? new Error('Failed to create user with available username')
}

export async function findAvailableUsername(baseUsername: string) {
  const base = normalizeUsername(baseUsername).slice(0, maxUsernameLength) || 'user'

  if (!(await isUsernameTaken(base))) {
    return base
  }

  for (let index = 2; index < 10_000; index += 1) {
    const suffix = `_${index}`
    const candidate = `${base.slice(0, maxUsernameLength - suffix.length)}${suffix}`

    if (!(await isUsernameTaken(candidate))) {
      return candidate
    }
  }

  throw new Error('Failed to generate username')
}

export async function isUsernameAvailable(username: string, currentUserId?: string) {
  const normalized = normalizeUsername(username)
  const validationError = usernameValidationMessage(normalized)

  if (validationError) {
    return {
      available: false,
      normalized,
      reason: validationError
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      username: normalized
    },
    select: {
      id: true
    }
  })

  return {
    available: !existingUser || existingUser.id === currentUserId,
    normalized,
    reason:
      existingUser && existingUser.id !== currentUserId
        ? 'Username is already taken'
        : null
  }
}

async function isUsernameTaken(username: string) {
  const user = await prisma.user.findUnique({
    where: {
      username
    },
    select: {
      id: true
    }
  })

  return Boolean(user)
}

function isUsernameUniqueConstraintError(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false
  }

  const target = error.meta?.target

  if (Array.isArray(target)) {
    return target.includes('username')
  }

  return typeof target === 'string' ? target.includes('username') : true
}
