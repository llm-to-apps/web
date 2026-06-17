import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../lib/auth';
import {
  appendOAuthRedirectCode,
  appendOAuthRedirectError,
  createAuthorizationCode,
  findActiveOAuthClient
} from '../../../lib/oauth';
import { prisma } from '../../../lib/db';
import { publicRequestOrigin } from '../../../lib/request-origin';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const responseType = searchParams.get('response_type');
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const scope = searchParams.get('scope');
  const state = searchParams.get('state');
  const prompt = searchParams.get('prompt');

  if (responseType !== 'code') {
    return oauthError('unsupported_response_type', 400);
  }

  if (!clientId || !redirectUri) {
    return oauthError('invalid_request', 400);
  }

  const client = await findActiveOAuthClient({ clientId, redirectUri });

  if (!client) {
    return oauthError('invalid_client', 400);
  }

  const user = await getCurrentUser();

  if (!user) {
    if (prompt === 'none') {
      return NextResponse.redirect(
        appendOAuthRedirectError(redirectUri, 'login_required', state)
      );
    }

    const loginUrl = new URL('/', publicRequestOrigin());
    loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);

    return NextResponse.redirect(loginUrl);
  }

  if (!user.onboarded) {
    const welcomeUrl = new URL('/welcome', publicRequestOrigin());

    return NextResponse.redirect(welcomeUrl);
  }

  const membership = await prisma.projectMember.findFirst({
    where: {
      projectId: client.projectId,
      userId: user.id
    },
    select: {
      id: true
    }
  });

  if (!membership) {
    return NextResponse.redirect(
      appendOAuthRedirectError(redirectUri, 'access_denied', state)
    );
  }

  const code = await createAuthorizationCode({
    clientId: client.id,
    redirectUri,
    scope,
    userId: user.id
  });

  return NextResponse.redirect(
    appendOAuthRedirectCode({
      code,
      redirectUri,
      state
    })
  );
}

function oauthError(error: string, status: number) {
  return NextResponse.json(
    {
      error
    },
    { status }
  );
}
