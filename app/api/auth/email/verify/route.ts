import { NextRequest, NextResponse } from 'next/server';

import {
  createSession,
  isDevelopmentEmailCodeEnabled,
  isValidEmail,
  normalizeEmail
} from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { verifyEmailLoginCode } from '../../../../../lib/email-login-codes';

type VerifyEmailAuthRequest = {
  code?: string;
  email?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as VerifyEmailAuthRequest;
  const email = normalizeEmail(body.email ?? '');
  const code = body.code?.trim() ?? '';

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, message: 'A valid email is required' },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { ok: false, message: 'Code is required' },
      { status: 400 }
    );
  }

  let isValidEmailCode = false;

  try {
    isValidEmailCode = await verifyEmailLoginCode(email, code);
  } catch (error) {
    console.error('[Auth] Failed to verify email login code', { email, error });
    return NextResponse.json(
      { ok: false, message: 'Failed to verify email code' },
      { status: 503 }
    );
  }

  if (!isValidEmailCode && !isDevelopmentEmailCodeEnabled()) {
    return NextResponse.json(
      { ok: false, message: 'Invalid or expired code' },
      { status: 400 }
    );
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email
    },
    select: {
      id: true,
      email: true,
      name: true,
      onboarded: true,
      aiExperienceLevel: true,
      vibeCodingExperienceLevel: true,
      onboardingGoal: true
    }
  });

  await createSession(user);

  return NextResponse.json({
    ok: true,
    user
  });
}
