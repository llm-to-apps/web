import { NextRequest, NextResponse } from 'next/server';

import { createSession, normalizeEmail, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';

type LoginRequest = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LoginRequest;
  const email = normalizeEmail(body.email ?? '');
  const password = body.password ?? '';

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true
    }
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { ok: false, message: 'Invalid email or password' },
      { status: 401 }
    );
  }

  await createSession({
    id: user.id,
    email: user.email,
    name: user.name
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  });
}
