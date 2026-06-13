import Redis from 'ioredis';
import { createHmac, createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { authSecret, redisUrl } from './env';

const emailCodePrefix = 'email-code-v1';
const emailCodeTtlSeconds = 10 * 60;

let redis: Redis | null = null;

export async function createEmailLoginCode(email: string) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

  await getRedis().set(emailLoginCodeKey(email), emailCodeValue(code), 'EX', emailCodeTtlSeconds);

  return {
    code,
    expiresAt: new Date(Date.now() + emailCodeTtlSeconds * 1000)
  };
}

export async function clearEmailLoginCode(email: string) {
  await getRedis().del(emailLoginCodeKey(email));
}

export async function verifyEmailLoginCode(email: string, code: string) {
  const storedValue = await getRedis().get(emailLoginCodeKey(email));

  if (!storedValue) {
    return false;
  }

  const [prefix, expectedHash] = storedValue.split('$');

  if (prefix !== emailCodePrefix || !constantTimeEqual(expectedHash, hashEmailCode(code))) {
    return false;
  }

  await clearEmailLoginCode(email);
  return true;
}

function getRedis() {
  redis ??= new Redis(redisUrl(), {
    maxRetriesPerRequest: null
  });

  return redis;
}

function emailLoginCodeKey(email: string) {
  return `auth:email-code:${createHash('sha256').update(email).digest('base64url')}`;
}

function emailCodeValue(code: string) {
  return `${emailCodePrefix}$${hashEmailCode(code)}`;
}

function hashEmailCode(value: string) {
  return createHmac('sha256', authSecret()).update(value).digest('base64url');
}

function constantTimeEqual(left: string | undefined, right: string) {
  if (!left) {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
