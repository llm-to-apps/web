import { NextRequest, NextResponse } from 'next/server';

import { authenticateOAuthAccessToken } from '../../../lib/oauth';

export async function GET(request: NextRequest) {
  const token = readBearerToken(request);

  if (!token) {
    return unauthorized();
  }

  const context = await authenticateOAuthAccessToken(token);

  if (!context) {
    return unauthorized();
  }

  return NextResponse.json({
    sub: context.user.id,
    email: context.user.email,
    name: context.user.name,
    project_id: context.projectId,
    role: context.role
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

function unauthorized() {
  return NextResponse.json(
    {
      error: 'invalid_token'
    },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer'
      }
    }
  );
}
