import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { parseExperienceLevel } from '../../../lib/profile';

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before completing onboarding' },
      { status: 401 }
    );
  }

  const data = (await request.json().catch(() => null)) as {
    aiExperienceLevel?: unknown;
    name?: unknown;
    vibeCodingExperienceLevel?: unknown;
  } | null;
  const name = String(data?.name ?? '').trim();

  if (!name) {
    return NextResponse.json(
      { ok: false, message: 'Name is required' },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: {
      id: user.id
    },
    data: {
      aiExperienceLevel: parseExperienceLevel(toFormValue(data?.aiExperienceLevel)),
      name,
      onboarded: true,
      vibeCodingExperienceLevel: parseExperienceLevel(
        toFormValue(data?.vibeCodingExperienceLevel)
      )
    }
  });

  return NextResponse.json({ ok: true });
}

function toFormValue(value: unknown) {
  return typeof value === 'string' ? value : null;
}
