import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { parseExperienceLevel } from '../../../../lib/profile';

const UI_DELAY_MS = 250;

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before updating settings' },
      { status: 401 }
    );
  }

  if (!user.onboarded) {
    return NextResponse.json(
      { ok: false, message: 'Complete onboarding first' },
      { status: 403 }
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

  await waitForUiDelay();

  await prisma.user.update({
    where: {
      id: user.id
    },
    data: {
      aiExperienceLevel: parseExperienceLevel(toFormValue(data?.aiExperienceLevel)),
      name,
      vibeCodingExperienceLevel: parseExperienceLevel(
        toFormValue(data?.vibeCodingExperienceLevel)
      )
    }
  });

  return NextResponse.json({ ok: true });
}

function waitForUiDelay() {
  return new Promise((resolve) => {
    setTimeout(resolve, UI_DELAY_MS);
  });
}

function toFormValue(value: unknown) {
  return typeof value === 'string' ? value : null;
}
