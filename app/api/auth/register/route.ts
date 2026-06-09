import { NextRequest, NextResponse } from 'next/server';

import {
  createSession,
  hashPassword,
  isValidEmail,
  normalizeEmail
} from '@/lib/auth';
import { prisma } from '@/lib/db';

type RegisterRequest = {
  email?: string;
  name?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RegisterRequest;
  const email = normalizeEmail(body.email ?? '');
  const name = body.name?.trim() || null;
  const password = body.password ?? '';

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, message: 'A valid email is required' },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, message: 'Password must be at least 8 characters' },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      { ok: false, message: 'An account with this email already exists' },
      { status: 409 }
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password)
    },
    select: {
      id: true,
      email: true,
      name: true
    }
  });

  await createSession(user);

  return NextResponse.json({ ok: true, user });
}
