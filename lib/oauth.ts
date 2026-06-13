import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';

import { prisma } from './db';
import {
  oauthEncryptionSecret,
  oauthInternalBaseUrl,
  oauthSigningSecret,
  projectPublicScheme
} from './env';
import { platformBaseUrl } from './request-origin';

const authorizationCodeTtlMs = 5 * 60 * 1000;
const accessTokenTtlSeconds = 60 * 60;

export type OAuthClientCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function oauthIssuerUrl() {
  return platformBaseUrl();
}

export function oauthUrls() {
  const issuer = oauthIssuerUrl();

  return {
    issuer,
    authorize: `${issuer}/oauth/authorize`,
    token: `${issuer}/oauth/token`,
    userinfo: `${issuer}/oauth/userinfo`,
    internalToken: `${oauthInternalBaseUrl()}/oauth/token`,
    internalUserinfo: `${oauthInternalBaseUrl()}/oauth/userinfo`,
    internalProjectUserTokenIntrospection: `${oauthInternalBaseUrl()}/api/project-user-tokens/introspect`,
    projectUserTokenIntrospection: `${issuer}/api/project-user-tokens/introspect`,
    requestHost: new URL(issuer).host
  };
}

export function createOAuthRedirectUri(domain: string) {
  const scheme = projectPublicScheme();
  return `${scheme}://${domain}/api/auth/callback/os7`;
}

export async function ensureProjectOAuthClient({
  domain,
  name,
  projectId
}: {
  domain: string;
  name: string;
  projectId: string;
}): Promise<OAuthClientCredentials> {
  const redirectUri = createOAuthRedirectUri(domain);
  const existingClient = await prisma.oAuthClient.findUnique({
    where: {
      projectId
    }
  });

  if (existingClient && !existingClient.revokedAt) {
    if (existingClient.redirectUri !== redirectUri || existingClient.name !== name) {
      const updatedClient = await prisma.oAuthClient.update({
        where: {
          id: existingClient.id
        },
        data: {
          name,
          redirectUri
        }
      });

      return {
        clientId: updatedClient.clientId,
        clientSecret: decryptOAuthSecret(updatedClient.clientSecretEncrypted),
        redirectUri: updatedClient.redirectUri
      };
    }

    return {
      clientId: existingClient.clientId,
      clientSecret: decryptOAuthSecret(existingClient.clientSecretEncrypted),
      redirectUri: existingClient.redirectUri
    };
  }

  const clientId = `os7_${randomBytes(18).toString('base64url')}`;
  const clientSecret = `os7_secret_${randomBytes(32).toString('base64url')}`;
  const client = await prisma.oAuthClient.create({
    data: {
      projectId,
      name,
      clientId,
      clientSecretHash: hashOAuthSecret(clientSecret),
      clientSecretEncrypted: encryptOAuthSecret(clientSecret),
      redirectUri
    }
  });

  return {
    clientId: client.clientId,
    clientSecret,
    redirectUri: client.redirectUri
  };
}

export async function findActiveOAuthClient({
  clientId,
  redirectUri
}: {
  clientId: string;
  redirectUri: string;
}) {
  const client = await prisma.oAuthClient.findUnique({
    where: {
      clientId
    }
  });

  if (!client || client.revokedAt || client.redirectUri !== redirectUri) {
    return null;
  }

  return client;
}

export async function createAuthorizationCode({
  clientId,
  redirectUri,
  scope,
  userId
}: {
  clientId: string;
  redirectUri: string;
  scope?: string | null;
  userId: string;
}) {
  const code = `os7_code_${randomBytes(32).toString('base64url')}`;

  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashOAuthToken(code),
      clientId,
      userId,
      redirectUri,
      scope: scope || null,
      expiresAt: new Date(Date.now() + authorizationCodeTtlMs)
    }
  });

  return code;
}

export async function exchangeAuthorizationCode({
  clientId,
  clientSecret,
  code,
  redirectUri
}: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) {
  const client = await findActiveOAuthClient({ clientId, redirectUri });

  if (!client || !constantTimeEqual(client.clientSecretHash, hashOAuthSecret(clientSecret))) {
    return null;
  }

  const authorizationCode = await prisma.oAuthAuthorizationCode.findUnique({
    where: {
      codeHash: hashOAuthToken(code)
    }
  });

  if (
    !authorizationCode ||
    authorizationCode.clientId !== client.id ||
    authorizationCode.redirectUri !== redirectUri ||
    authorizationCode.usedAt ||
    authorizationCode.expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  const accessToken = `os7_access_${randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + accessTokenTtlSeconds * 1000);

  await prisma.$transaction([
    prisma.oAuthAuthorizationCode.update({
      where: {
        id: authorizationCode.id
      },
      data: {
        usedAt: new Date()
      }
    }),
    prisma.oAuthAccessToken.create({
      data: {
        tokenHash: hashOAuthToken(accessToken),
        clientId: client.id,
        userId: authorizationCode.userId,
        scope: authorizationCode.scope,
        expiresAt
      }
    })
  ]);

  return {
    accessToken,
    expiresIn: accessTokenTtlSeconds,
    scope: authorizationCode.scope,
    tokenType: 'Bearer'
  };
}

export async function authenticateOAuthAccessToken(token: string) {
  const accessToken = await prisma.oAuthAccessToken.findUnique({
    where: {
      tokenHash: hashOAuthToken(token)
    },
    include: {
      client: {
        select: {
          projectId: true
        }
      },
      user: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    }
  });

  if (
    !accessToken ||
    accessToken.revokedAt ||
    accessToken.expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: accessToken.client.projectId,
        userId: accessToken.userId
      }
    },
    select: {
      role: true
    }
  });

  if (!membership) {
    return null;
  }

  return {
    projectId: accessToken.client.projectId,
    role: membership.role,
    scope: accessToken.scope,
    user: accessToken.user
  };
}

export function appendOAuthRedirectError(
  redirectUri: string,
  error: string,
  state?: string | null
) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);

  if (state) {
    url.searchParams.set('state', state);
  }

  return url;
}

export function appendOAuthRedirectCode({
  code,
  redirectUri,
  state
}: {
  code: string;
  redirectUri: string;
  state?: string | null;
}) {
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);

  if (state) {
    url.searchParams.set('state', state);
  }

  return url;
}

function encryptOAuthSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', oauthEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptOAuthSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split('.');

  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Invalid encrypted OAuth secret');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    oauthEncryptionKey(),
    Buffer.from(ivValue, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function hashOAuthSecret(value: string) {
  return createHmac('sha256', oauthSigningSecret()).update(value).digest('base64url');
}

function hashOAuthToken(value: string) {
  return createHmac('sha256', oauthSigningSecret()).update(value).digest('base64url');
}

function oauthEncryptionKey() {
  const secret = oauthEncryptionSecret();

  return createHash('sha256').update(secret).digest();
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
