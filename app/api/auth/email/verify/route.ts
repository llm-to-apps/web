import { NextRequest, NextResponse } from 'next/server';

import {
  createSession,
  createAuthHash,
  isDevelopmentEmailCodeEnabled,
  isValidEmail,
  normalizeEmail
} from '@/lib/auth';
import { prisma } from '@/lib/db';

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

  if (!isDevelopmentEmailCodeEnabled()) {
    return NextResponse.json(
      { ok: false, message: 'Email code delivery is not configured yet' },
      { status: 501 }
    );
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      authHash: createAuthHash()
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
