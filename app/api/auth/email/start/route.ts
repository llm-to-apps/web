import { NextRequest, NextResponse } from 'next/server';

import { isValidEmail, normalizeEmail, passwordlessHash } from '@/lib/auth';
import { prisma } from '@/lib/db';

type StartEmailAuthRequest = {
  email?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as StartEmailAuthRequest;
  const email = normalizeEmail(body.email ?? '');

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, message: 'A valid email is required' },
      { status: 400 }
    );
  }

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: passwordlessHash()
    }
  });

  return NextResponse.json({
    ok: true
  });
}
