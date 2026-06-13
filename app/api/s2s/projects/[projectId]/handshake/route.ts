import { NextRequest, NextResponse } from 'next/server';

import { authenticateAuthToken } from '@/lib/auth-tokens';
import { prisma } from '@/lib/db';

type HandshakeContext = {
  params: Promise<{ projectId: string }> | { projectId: string };
};

export async function POST(request: NextRequest, context: HandshakeContext) {
  const { projectId } = await context.params;
  const token = readBearerToken(request);

  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const authContext = await authenticateAuthToken({
    projectId,
    scope: 'project:service',
    subjectType: 'project',
    token
  });

  if (!authContext?.projectId) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id: projectId,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true,
      templateId: true,
      templateName: true
    }
  });

  if (!project) {
    return NextResponse.json({ ok: false, message: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    project,
    scope: 'project:service',
    tokenId: authContext.tokenId
  });
}

function readBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const [scheme, token] = authorization.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}
