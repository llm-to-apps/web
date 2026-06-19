import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from 'node:crypto'

import { prisma } from '../db'
import { authTokenEncryptionSecret, authTokenSecret } from '../env'

const defaultTokenTtlDays = 90

type AuthTokenSubjectType = 'project' | 'user'

type AuthTokenInput = {
  name: string
  projectId?: string | null
  scope: string
  subjectType: AuthTokenSubjectType
  ttlDays?: number
  userId?: string | null
}

type AuthenticateAuthTokenInput = {
  projectId?: string | null
  scope: string
  subjectType?: AuthTokenSubjectType
  token: string
}

export function createAuthTokenValue(scope: string) {
  return `${scope.replace(/[^a-z0-9]/gi, '_')}_${randomBytes(32).toString('base64url')}`
}

export async function createAuthToken(input: AuthTokenInput) {
  assertValidAuthTokenSubject(input)

  const token = createAuthTokenValue(input.scope)
  const ttlDays = input.ttlDays ?? defaultTokenTtlDays
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
  const record = await prisma.authToken.create({
    data: {
      encryptedToken: encryptAuthToken(token),
      expiresAt,
      name: input.name,
      projectId: input.projectId ?? null,
      scope: input.scope,
      subjectType: input.subjectType,
      tokenHash: hashAuthToken(token),
      tokenLast4: token.slice(-4),
      userId: input.userId ?? null
    },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      name: true,
      projectId: true,
      scope: true,
      subjectType: true,
      tokenLast4: true,
      userId: true
    }
  })

  return {
    ...record,
    token
  }
}

export async function ensureAuthToken(input: AuthTokenInput) {
  assertValidAuthTokenSubject(input)

  const existingToken = await prisma.authToken.findFirst({
    where: {
      projectId: input.projectId ?? null,
      revokedAt: null,
      scope: input.scope,
      subjectType: input.subjectType,
      userId: input.userId ?? null,
      OR: [
        {
          expiresAt: null
        },
        {
          expiresAt: {
            gt: new Date()
          }
        }
      ]
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true,
      createdAt: true,
      encryptedToken: true,
      expiresAt: true,
      name: true,
      projectId: true,
      scope: true,
      subjectType: true,
      tokenLast4: true,
      userId: true
    }
  })

  if (existingToken?.encryptedToken) {
    return {
      id: existingToken.id,
      createdAt: existingToken.createdAt,
      expiresAt: existingToken.expiresAt,
      name: existingToken.name,
      projectId: existingToken.projectId,
      scope: existingToken.scope,
      subjectType: existingToken.subjectType,
      token: decryptAuthToken(existingToken.encryptedToken),
      tokenLast4: existingToken.tokenLast4,
      userId: existingToken.userId
    }
  }

  return createAuthToken(input)
}

export async function authenticateAuthToken({
  projectId,
  scope,
  subjectType,
  token
}: AuthenticateAuthTokenInput) {
  const tokenHash = hashAuthToken(token)
  const authToken = await prisma.authToken.findUnique({
    where: {
      tokenHash
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          name: true
        }
      }
    }
  })

  if (
    !authToken ||
    authToken.revokedAt ||
    authToken.scope !== scope ||
    (subjectType !== undefined && authToken.subjectType !== subjectType) ||
    (projectId !== undefined && authToken.projectId !== projectId) ||
    (authToken.expiresAt && authToken.expiresAt.getTime() <= Date.now())
  ) {
    return null
  }

  if (!constantTimeEqual(authToken.tokenHash, tokenHash)) {
    return null
  }

  await prisma.authToken
    .update({
      where: {
        id: authToken.id
      },
      data: {
        lastUsedAt: new Date()
      }
    })
    .catch(() => null)

  return {
    projectId: authToken.projectId,
    subjectType: authToken.subjectType,
    tokenId: authToken.id,
    user: authToken.user,
    userId: authToken.userId
  }
}

function assertValidAuthTokenSubject(input: AuthTokenInput) {
  if (input.subjectType === 'user' && !input.userId) {
    throw new Error('user auth tokens require userId')
  }

  if (input.scope === 'project:mcp' && (!input.userId || !input.projectId)) {
    throw new Error('project:mcp auth tokens require userId and projectId')
  }

  if (input.scope === 'project:service' && !input.projectId) {
    throw new Error('project:service auth tokens require projectId')
  }
}

function hashAuthToken(value: string) {
  return createHmac('sha256', authTokenSecret()).update(value).digest('base64url')
}

function encryptAuthToken(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', authTokenEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
}

function decryptAuthToken(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split('.')

  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Invalid encrypted auth token')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    authTokenEncryptionKey(),
    Buffer.from(ivValue, 'base64url')
  )
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]).toString('utf8')
}

function authTokenEncryptionKey() {
  const secret = authTokenEncryptionSecret()

  return createHash('sha256').update(secret).digest()
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  )
}
