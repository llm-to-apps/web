import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { authenticateAuthToken } from '@/lib/auth-tokens';

export async function POST(request: NextRequest) {
  const token = readBearerToken(request);

  if (!token) {
    return inactive();
  }

  const context = await authenticateAuthToken({
    scope: 'project:mcp',
    subjectType: 'user',
    token
  });

  if (!context?.projectId || !context.user) {
    return inactive();
  }

  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: context.projectId,
        userId: context.user.id
      }
    },
    select: {
      role: true
    }
  });

  if (!membership || membership.role === 'viewer') {
    return inactive();
  }

  return NextResponse.json({
    active: true,
    projectId: context.projectId,
    role: membership.role,
    scope: 'project:mcp',
    tokenId: context.tokenId,
    user: {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name
    }
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

function inactive() {
  return NextResponse.json({
    active: false
  });
}
