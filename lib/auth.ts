import { cookies } from 'next/headers';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { prisma } from './db';

const sessionCookie = 'llagents_session';
const sessionTtlSeconds = 60 * 60 * 24 * 30;

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 64).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(user: CurrentUser) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionTtlSeconds,
    path: '/'
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;

  if (token) {
    await prisma.session
      .delete({
        where: {
          tokenHash: hashToken(token)
        }
      })
      .catch(() => null);
  }

  cookieStore.delete(sessionCookie);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    }
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }

  return session.user;
}

function hashToken(value: string) {
  return createHmac('sha256', authSecret()).update(value).digest('base64url');
}

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production');
  }
  return secret || 'local-development-auth-secret';
}
