import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../../../lib/auth';
import { createAuthorizationCode, findActiveOAuthClient } from '../../../../../../lib/oauth';
import { prisma } from '../../../../../../lib/db';
import { projectMemberWhere } from '../../../../../../lib/project-members';

type FrameCodeRequest = {
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  state?: string;
};

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    console.warn('[OAuth Frame Code] rejected unsigned request');
    return NextResponse.json({ ok: false, message: 'Sign in required' }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as FrameCodeRequest | null;
  console.info('[OAuth Frame Code] request', {
    clientId: body?.clientId,
    projectId: id,
    redirectUri: body?.redirectUri,
    state: body?.state,
    userId: user.id
  });

  if (!body?.clientId || !body.redirectUri || !body.state) {
    console.warn('[OAuth Frame Code] invalid request body', body);
    return NextResponse.json({ ok: false, message: 'Invalid OAuth request' }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id,
      members: projectMemberWhere(user.id),
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true,
      domain: true
    }
  });

  if (!project) {
    console.warn('[OAuth Frame Code] project not found or not owned', {
      projectId: id,
      userId: user.id
    });
    return NextResponse.json({ ok: false, message: 'Project not found' }, { status: 404 });
  }

  const redirectUrl = new URL(body.redirectUri);

  if (redirectUrl.host !== project.domain) {
    console.warn('[OAuth Frame Code] redirect host mismatch', {
      expectedHost: project.domain,
      projectId: project.id,
      redirectHost: redirectUrl.host
    });
    return NextResponse.json({ ok: false, message: 'Redirect URI is not allowed' }, { status: 400 });
  }

  const client = await findActiveOAuthClient({
    clientId: body.clientId,
    redirectUri: body.redirectUri
  });

  if (!client || client.projectId !== project.id) {
    console.warn('[OAuth Frame Code] client mismatch', {
      clientId: body.clientId,
      clientProjectId: client?.projectId,
      projectId: project.id
    });
    return NextResponse.json({ ok: false, message: 'OAuth client not found' }, { status: 404 });
  }

  const code = await createAuthorizationCode({
    clientId: client.id,
    redirectUri: body.redirectUri,
    scope: body.scope ?? 'openid email profile',
    userId: user.id
  });
  console.info('[OAuth Frame Code] issued code', {
    clientId: body.clientId,
    projectId: project.id,
    redirectUri: body.redirectUri,
    state: body.state,
    userId: user.id
  });

  return NextResponse.json({
    ok: true,
    code,
    state: body.state
  });
}
