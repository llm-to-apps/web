import { NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before viewing the store' },
      { status: 401 }
    );
  }

  if (!user.onboarded) {
    return NextResponse.json(
      { ok: false, message: 'Complete onboarding first' },
      { status: 403 }
    );
  }

  const templates = await prisma.appTemplate.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  });

  return NextResponse.json({
    ok: true,
    templates
  });
}
