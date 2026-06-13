import { cookies } from 'next/headers';
import { createHmac, randomBytes } from 'node:crypto';
import type { UserExperienceLevel } from '@prisma/client';

import { prisma } from './db';
import { authSecret, envFlag, isProductionEnv } from './env';

const sessionCookie = 'os7_session';
const sessionTtlSeconds = 60 * 60 * 24 * 30;

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  onboarded: boolean;
  aiExperienceLevel: UserExperienceLevel | null;
  vibeCodingExperienceLevel: UserExperienceLevel | null;
  onboardingGoal: string | null;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isDevelopmentEmailCodeEnabled() {
  return envFlag('AUTH_ACCEPT_ANY_EMAIL_CODE') || !isProductionEnv();
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
    secure: isProductionEnv(),
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
          name: true,
          onboarded: true,
          aiExperienceLevel: true,
          vibeCodingExperienceLevel: true,
          onboardingGoal: true
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
