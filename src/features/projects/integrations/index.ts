import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { authenticateAuthToken } from '@/server/auth/tokens'
import { prisma } from '@/server/db'
import {
  authTokenEncryptionSecret,
  googleOAuthClientId,
  googleOAuthEnabled,
  googleOAuthClientSecret,
  isProductionEnv,
  oauthSigningSecret,
  platformBaseUrl
} from '@/server/env'
import { jsonErrorMessage, jsonOk } from '@/server/http'
import { projectMemberWhere } from '@/server/project-members'
import { type TemplateManifest } from '@/shared/templates/manifest'

type IntegrationRouteContext = {
  params:
    | Promise<{ integrationId: string; projectId: string }>
    | { integrationId: string; projectId: string }
}

type GoogleCallbackState = {
  integrationId: string
  nonce: string
  projectId: string
  redirectUri: string
  scopes: string[]
  userId: string
}

type ProviderTokenResponse = {
  access_token?: string
  error?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

const googleAuthorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
const googleTokenUrl = 'https://oauth2.googleapis.com/token'
const stateCookie = 'os7_integration_oauth_state'
const stateTtlSeconds = 10 * 60
const tokenRefreshSkewMs = 60 * 1000

export async function handleProjectIntegrationConnectGet(
  request: NextRequest,
  context: IntegrationRouteContext
) {
  const user = await getCurrentUser()

  if (!user) {
    const loginUrl = new URL('/', platformBaseUrl())
    loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  const { integrationId, projectId } = await context.params
  const projectIntegration = await findProjectIntegration({
    access: 'view',
    integrationId,
    projectId,
    userId: user.id
  })

  if (!projectIntegration) {
    return jsonErrorMessage('Integration not found', 404)
  }

  if (projectIntegration.integration.provider !== 'google') {
    return jsonErrorMessage('Integration provider is not supported', 400)
  }

  if (!isGoogleIntegrationConfigured()) {
    return jsonErrorMessage('Google integrations are not configured', 503)
  }

  const redirectUri = resolveReturnRedirectUri(
    request.nextUrl.searchParams.get('redirect_uri'),
    projectIntegration.project
  )

  if (!redirectUri) {
    return jsonErrorMessage('Invalid redirect_uri', 400)
  }

  const nonce = randomBytes(24).toString('base64url')
  const state = signState({
    integrationId,
    nonce,
    projectId,
    redirectUri,
    scopes: projectIntegration.integration.scopes,
    userId: user.id
  })
  const response = NextResponse.redirect(
    buildGoogleAuthorizeUrl({
      scopes: projectIntegration.integration.scopes,
      state
    })
  )

  response.cookies.set(stateCookie, nonce, {
    httpOnly: true,
    maxAge: stateTtlSeconds,
    path: '/',
    sameSite: 'lax',
    secure: isProductionEnv()
  })

  return response
}

export async function handleGoogleIntegrationCallbackGet(request: NextRequest) {
  const error = request.nextUrl.searchParams.get('error')
  const code = request.nextUrl.searchParams.get('code')
  const stateValue = request.nextUrl.searchParams.get('state')
  const state = stateValue ? verifyState(stateValue) : null
  const fallbackRedirectUri = platformBaseUrl()

  if (!state) {
    return NextResponse.redirect(withStatusParam(fallbackRedirectUri, 'invalid_state'))
  }

  const responseRedirect = (status: string) =>
    NextResponse.redirect(withStatusParam(state.redirectUri, status))
  const expectedNonce = request.cookies.get(stateCookie)?.value

  if (!expectedNonce || !constantTimeEqual(expectedNonce, state.nonce)) {
    return responseRedirect('invalid_state')
  }

  if (error) {
    return responseRedirect(error)
  }

  if (!code) {
    return responseRedirect('missing_code')
  }

  const projectIntegration = await findProjectIntegration({
    access: 'view',
    integrationId: state.integrationId,
    projectId: state.projectId,
    userId: state.userId
  })

  if (!projectIntegration || projectIntegration.integration.provider !== 'google') {
    return responseRedirect('invalid_integration')
  }

  const token = await exchangeGoogleCode(code)

  if (!token.access_token) {
    return responseRedirect(token.error ?? 'token_exchange_failed')
  }

  const existingGrant = await prisma.projectIntegrationGrant.findUnique({
    where: {
      projectId_userId_integrationId: {
        integrationId: state.integrationId,
        projectId: state.projectId,
        userId: state.userId
      }
    },
    select: {
      refreshTokenEncrypted: true
    }
  })
  const refreshTokenEncrypted = token.refresh_token
    ? encryptIntegrationSecret(token.refresh_token)
    : existingGrant?.refreshTokenEncrypted

  await prisma.projectIntegrationGrant.upsert({
    where: {
      projectId_userId_integrationId: {
        integrationId: state.integrationId,
        projectId: state.projectId,
        userId: state.userId
      }
    },
    create: {
      accessTokenEncrypted: encryptIntegrationSecret(token.access_token),
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      integrationId: state.integrationId,
      metadata: token.scope ? { scope: token.scope } : undefined,
      projectId: state.projectId,
      provider: 'google',
      refreshTokenEncrypted,
      scopes: projectIntegration.integration.scopes,
      tokenType: token.token_type ?? 'Bearer',
      userId: state.userId
    },
    update: {
      accessTokenEncrypted: encryptIntegrationSecret(token.access_token),
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      metadata: token.scope ? { scope: token.scope } : undefined,
      provider: 'google',
      refreshTokenEncrypted,
      revokedAt: null,
      scopes: projectIntegration.integration.scopes,
      tokenType: token.token_type ?? 'Bearer'
    }
  })

  const response = responseRedirect('connected')
  response.cookies.delete(stateCookie)
  return response
}

export async function handleS2SProjectIntegrationStatusGet(
  request: NextRequest,
  context: IntegrationRouteContext
) {
  const auth = await authenticateProjectServiceRequest(request, context)

  if (!auth.ok) {
    return auth.response
  }

  const userId = request.nextUrl.searchParams.get('userId')

  if (!userId) {
    return jsonErrorMessage('userId is required', 400)
  }

  const projectIntegration = await findProjectIntegration({
    access: 'view',
    integrationId: auth.integrationId,
    projectId: auth.projectId,
    userId
  })

  if (!projectIntegration) {
    return jsonErrorMessage('Integration not found', 404)
  }

  const grant = await prisma.projectIntegrationGrant.findUnique({
    where: {
      projectId_userId_integrationId: {
        integrationId: auth.integrationId,
        projectId: auth.projectId,
        userId
      }
    },
    select: {
      expiresAt: true,
      provider: true,
      revokedAt: true,
      scopes: true,
      updatedAt: true
    }
  })

  return jsonOk({
    connected: Boolean(grant && !grant.revokedAt),
    expiresAt: grant?.expiresAt?.toISOString() ?? null,
    integration: projectIntegration.integration,
    provider: grant?.provider ?? projectIntegration.integration.provider,
    scopes: grant?.scopes ?? projectIntegration.integration.scopes,
    updatedAt: grant?.updatedAt.toISOString() ?? null
  })
}

export async function handleS2SProjectIntegrationTokenPost(
  request: NextRequest,
  context: IntegrationRouteContext
) {
  const auth = await authenticateProjectServiceRequest(request, context)

  if (!auth.ok) {
    return auth.response
  }

  const body = (await request.json().catch(() => null)) as { userId?: string } | null
  const userId = body?.userId

  if (!userId) {
    return jsonErrorMessage('userId is required', 400)
  }

  const projectIntegration = await findProjectIntegration({
    access: 'view',
    integrationId: auth.integrationId,
    projectId: auth.projectId,
    userId
  })

  if (!projectIntegration || projectIntegration.integration.provider !== 'google') {
    return jsonErrorMessage('Integration not found', 404)
  }

  const grant = await prisma.projectIntegrationGrant.findUnique({
    where: {
      projectId_userId_integrationId: {
        integrationId: auth.integrationId,
        projectId: auth.projectId,
        userId
      }
    }
  })

  if (!grant || grant.revokedAt) {
    return jsonErrorMessage('Integration is not connected', 404)
  }

  const token = await readFreshGoogleAccessToken(grant)

  if (!token) {
    return jsonErrorMessage('Integration requires reconnect', 409)
  }

  return jsonOk({
    accessToken: token.accessToken,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    expiresIn: token.expiresAt
      ? Math.max(0, Math.floor((token.expiresAt.getTime() - Date.now()) / 1000))
      : null,
    provider: 'google',
    scopes: grant.scopes,
    tokenType: token.tokenType
  })
}

async function authenticateProjectServiceRequest(
  request: NextRequest,
  context: IntegrationRouteContext
) {
  const { integrationId, projectId } = await context.params
  const token = readBearerToken(request)

  if (!token) {
    return {
      ok: false as const,
      response: jsonErrorMessage('Unauthorized', 401)
    }
  }

  const authContext = await authenticateAuthToken({
    projectId,
    scope: 'project:service',
    subjectType: 'project',
    token
  })

  if (!authContext?.projectId) {
    return {
      ok: false as const,
      response: jsonErrorMessage('Unauthorized', 401)
    }
  }

  return {
    integrationId,
    ok: true as const,
    projectId
  }
}

async function findProjectIntegration({
  access,
  integrationId,
  projectId,
  userId
}: {
  access: 'view' | 'edit' | 'admin'
  integrationId: string
  projectId: string
  userId: string
}) {
  const project = await prisma.project.findFirst({
    where: {
      deletedAt: null,
      id: projectId,
      members: projectMemberWhere(userId, access),
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      devDomain: true,
      devUrl: true,
      domain: true,
      id: true,
      templateId: true,
      url: true
    }
  })

  if (!project) {
    return null
  }

  const template = await prisma.appTemplate.findUnique({
    where: {
      id: project.templateId
    },
    select: {
      manifest: true
    }
  })
  const manifest = template?.manifest as TemplateManifest | null
  const integration = manifest?.integrations?.[integrationId]

  if (!integration) {
    return null
  }

  return {
    integration,
    project
  }
}

function buildGoogleAuthorizeUrl({
  scopes,
  state
}: {
  scopes: string[]
  state: string
}) {
  const url = new URL(googleAuthorizeUrl)
  url.searchParams.set('client_id', googleOAuthClientId() ?? '')
  url.searchParams.set('redirect_uri', googleIntegrationRedirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('prompt', 'consent')
  return url
}

async function exchangeGoogleCode(code: string) {
  const response = await fetch(googleTokenUrl, {
    body: new URLSearchParams({
      client_id: googleOAuthClientId() ?? '',
      client_secret: googleOAuthClientSecret() ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: googleIntegrationRedirectUri()
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    method: 'POST'
  })

  return (await response.json().catch(() => ({}))) as ProviderTokenResponse
}

async function readFreshGoogleAccessToken(grant: {
  accessTokenEncrypted: string | null
  expiresAt: Date | null
  id: string
  refreshTokenEncrypted: string | null
  tokenType: string
}) {
  if (
    grant.accessTokenEncrypted &&
    (!grant.expiresAt || grant.expiresAt.getTime() > Date.now() + tokenRefreshSkewMs)
  ) {
    return {
      accessToken: decryptIntegrationSecret(grant.accessTokenEncrypted),
      expiresAt: grant.expiresAt,
      tokenType: grant.tokenType
    }
  }

  if (!grant.refreshTokenEncrypted) {
    return null
  }

  const response = await fetch(googleTokenUrl, {
    body: new URLSearchParams({
      client_id: googleOAuthClientId() ?? '',
      client_secret: googleOAuthClientSecret() ?? '',
      grant_type: 'refresh_token',
      refresh_token: decryptIntegrationSecret(grant.refreshTokenEncrypted)
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    method: 'POST'
  })
  const token = (await response.json().catch(() => ({}))) as ProviderTokenResponse

  if (!response.ok || !token.access_token) {
    return null
  }

  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000)
    : null
  const tokenType = token.token_type ?? 'Bearer'

  await prisma.projectIntegrationGrant.update({
    where: {
      id: grant.id
    },
    data: {
      accessTokenEncrypted: encryptIntegrationSecret(token.access_token),
      expiresAt,
      tokenType
    }
  })

  return {
    accessToken: token.access_token,
    expiresAt,
    tokenType
  }
}

function googleIntegrationRedirectUri() {
  return `${platformBaseUrl()}/api/integrations/google/callback`
}

function isGoogleIntegrationConfigured() {
  return Boolean(googleOAuthEnabled() && googleOAuthClientId() && googleOAuthClientSecret())
}

function resolveReturnRedirectUri(
  value: string | null,
  project: {
    devDomain: string | null
    devUrl: string | null
    domain: string
    url: string
  }
) {
  const candidate = value || project.url

  try {
    const url = new URL(candidate)
    const allowedOrigins = new Set(
      [project.url, project.devUrl]
        .filter(Boolean)
        .map((item) => new URL(item as string).origin)
    )
    allowedOrigins.add(new URL(`https://${project.domain}`).origin)

    if (project.devDomain) {
      allowedOrigins.add(new URL(`https://${project.devDomain}`).origin)
    }

    return allowedOrigins.has(url.origin) ? url.toString() : null
  } catch {
    return null
  }
}

function withStatusParam(redirectUri: string, status: string) {
  const url = new URL(redirectUri)
  url.searchParams.set('integration_status', status)
  return url
}

function signState(payload: GoogleCallbackState) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', oauthSigningSecret())
    .update(body)
    .digest('base64url')

  return `${body}.${signature}`
}

function verifyState(value: string) {
  const [body, signature] = value.split('.', 2)

  if (!body || !signature) {
    return null
  }

  const expectedSignature = createHmac('sha256', oauthSigningSecret())
    .update(body)
    .digest('base64url')

  if (!constantTimeEqual(signature, expectedSignature)) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GoogleCallbackState
  } catch {
    return null
  }
}

function encryptIntegrationSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', integrationEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
}

function decryptIntegrationSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split('.')

  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Invalid encrypted integration secret')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    integrationEncryptionKey(),
    Buffer.from(ivValue, 'base64url')
  )
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]).toString('utf8')
}

function integrationEncryptionKey() {
  return createHash('sha256').update(authTokenEncryptionSecret()).digest()
}

function readBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? ''
  const [scheme, token] = authorization.split(/\s+/, 2)

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  )
}
