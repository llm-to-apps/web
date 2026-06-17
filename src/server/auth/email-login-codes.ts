import Redis from 'ioredis'
import { createHmac, createHash, randomInt, timingSafeEqual } from 'node:crypto'

import { authSecret, isProductionEnv, optionalEnv, redisUrl } from '../env'

const emailCodePrefix = 'email-code-v1'
const emailCodeLength = 4
const emailCodeTtlSeconds = 10 * 60

let redis: Redis | null = null
const memoryCodes = new Map<string, { expiresAt: number; value: string }>()

export async function createEmailLoginCode(email: string) {
  const code = randomInt(0, 10 ** emailCodeLength)
    .toString()
    .padStart(emailCodeLength, '0')

  await setEmailCode(email, emailCodeValue(code))

  return {
    code,
    expiresAt: new Date(Date.now() + emailCodeTtlSeconds * 1000)
  }
}

export async function clearEmailLoginCode(email: string) {
  if (shouldUseMemoryCodes()) {
    memoryCodes.delete(emailLoginCodeKey(email))
    return
  }

  await getRedis().del(emailLoginCodeKey(email))
}

export async function verifyEmailLoginCode(email: string, code: string) {
  const storedValue = await getEmailCode(email)

  if (!storedValue) {
    return false
  }

  const [prefix, expectedHash] = storedValue.split('$')

  if (
    prefix !== emailCodePrefix ||
    !constantTimeEqual(expectedHash, hashEmailCode(code))
  ) {
    return false
  }

  await clearEmailLoginCode(email)
  return true
}

function getRedis() {
  redis ??= new Redis(redisUrl(), {
    maxRetriesPerRequest: null
  })

  return redis
}

async function setEmailCode(email: string, value: string) {
  if (shouldUseMemoryCodes()) {
    memoryCodes.set(emailLoginCodeKey(email), {
      expiresAt: Date.now() + emailCodeTtlSeconds * 1000,
      value
    })
    return
  }

  await getRedis().set(emailLoginCodeKey(email), value, 'EX', emailCodeTtlSeconds)
}

async function getEmailCode(email: string) {
  if (shouldUseMemoryCodes()) {
    const record = memoryCodes.get(emailLoginCodeKey(email))

    if (!record) {
      return null
    }

    if (record.expiresAt <= Date.now()) {
      memoryCodes.delete(emailLoginCodeKey(email))
      return null
    }

    return record.value
  }

  return getRedis().get(emailLoginCodeKey(email))
}

function shouldUseMemoryCodes() {
  return !optionalEnv('REDIS_URL') && !isProductionEnv()
}

function emailLoginCodeKey(email: string) {
  return `auth:email-code:${createHash('sha256').update(email).digest('base64url')}`
}

function emailCodeValue(code: string) {
  return `${emailCodePrefix}$${hashEmailCode(code)}`
}

function hashEmailCode(value: string) {
  return createHmac('sha256', authSecret()).update(value).digest('base64url')
}

function constantTimeEqual(left: string | undefined, right: string) {
  if (!left) {
    return false
  }

  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  )
}
