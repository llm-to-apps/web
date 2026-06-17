import { NextResponse } from 'next/server';

import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { projectMemberWhere } from '../../../lib/project-members';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before viewing applications' },
      { status: 401 }
    );
  }

  const projects = await prisma.project.findMany({
    where: {
      members: projectMemberWhere(user.id),
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      templateId: true,
      templateName: true,
      slug: true,
      domain: true,
      url: true,
      status: true,
      deployError: true
    }
  });

  return NextResponse.json({
    ok: true,
    projects
  });
}
