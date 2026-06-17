import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { createAuthToken } from '../../../lib/auth-tokens';

type CreatePersonalMcpTokenRequest = {
  name?: string;
};

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ ok: false, message: 'Sign in required' }, { status: 401 });
  }

  const tokens = await prisma.authToken.findMany({
    where: {
      subjectType: 'user',
      userId: user.id,
      scope: 'personal:mcp',
      revokedAt: null
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true,
      name: true,
      tokenLast4: true,
      lastUsedAt: true,
      createdAt: true
    }
  });

  return NextResponse.json({ ok: true, tokens });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ ok: false, message: 'Sign in required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreatePersonalMcpTokenRequest;
  const token = await createAuthToken({
    subjectType: 'user',
    userId: user.id,
    scope: 'personal:mcp',
    name: body.name?.trim() || 'Personal OS MCP'
  });

  return NextResponse.json({
    ok: true,
    token
  });
}
