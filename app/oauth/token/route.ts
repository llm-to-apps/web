import { NextRequest, NextResponse } from 'next/server';

import { exchangeAuthorizationCode } from '@/lib/oauth';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const grantType = stringValue(formData.get('grant_type'));
  const code = stringValue(formData.get('code'));
  const redirectUri = stringValue(formData.get('redirect_uri'));
  const credentials = readClientCredentials(request, formData);

  if (grantType !== 'authorization_code') {
    return oauthError('unsupported_grant_type', 400);
  }

  if (!code || !redirectUri || !credentials.clientId || !credentials.clientSecret) {
    return oauthError('invalid_request', 400);
  }

  const token = await exchangeAuthorizationCode({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    code,
    redirectUri
  });

  if (!token) {
    return oauthError('invalid_grant', 400);
  }

  return NextResponse.json({
    access_token: token.accessToken,
    token_type: token.tokenType,
    expires_in: token.expiresIn,
    scope: token.scope ?? undefined
  });
}

function readClientCredentials(request: NextRequest, formData: FormData) {
  const authorization = request.headers.get('authorization') ?? '';
  const [scheme, value] = authorization.split(/\s+/, 2);

  if (scheme?.toLowerCase() === 'basic' && value) {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');

    if (separatorIndex >= 0) {
      return {
        clientId: decoded.slice(0, separatorIndex),
        clientSecret: decoded.slice(separatorIndex + 1)
      };
    }
  }

  return {
    clientId: stringValue(formData.get('client_id')),
    clientSecret: stringValue(formData.get('client_secret'))
  };
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

function oauthError(error: string, status: number) {
  return NextResponse.json(
    {
      error
    },
    { status }
  );
}
