import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

type ProjectRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(_request: NextRequest, context: ProjectRouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before viewing applications' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const project = await prisma.project.findFirst({
    where: {
      id,
      userId: user.id
    },
    select: {
      id: true,
      templateId: true,
      templateName: true,
      domain: true,
      url: true,
      status: true,
      deployError: true
    }
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, message: 'Application not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    project
  });
}
