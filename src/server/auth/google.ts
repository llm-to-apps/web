import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { createSession, isValidEmail, normalizeEmail } from '@/server/auth'
import { prisma } from '@/server/db'
import {
  googleOAuthClientId,
  googleOAuthClientSecret,
  googleOAuthRedirectUri,
  isProductionEnv,
  platformBaseUrl
} from '@/server/env'
import { logError, logWarn } from '@/server/logger'
import { withAvailableUsernameRetry } from '@/server/auth/username'

const googleAuthorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
const googleTokenUrl = 'https://oauth2.googleapis.com/token'
const googleUserInfoUrl = 'https://www.googleapis.com/oauth2/v3/userinfo'
const stateCookie = 'os7_google_oauth_state'
const redirectCookie = 'os7_google_oauth_redirect'
const stateTtlSeconds = 10 * 60

type GoogleUserInfo = {
  email?: string
  email_verified?: boolean
  name?: string
}

const currentUserSelect = {
  aiExperienceLevel: true,
  email: true,
  id: true,
  name: true,
  onboarded: true,
  onboardingGoal: true,
  username: true,
  vibeCodingExperienceLevel: true
} as const

export function isGoogleOAuthConfigured() {
  return Boolean(googleOAuthClientId() && googleOAuthClientSecret())
}

export async function startGoogleOAuth(request: NextRequest) {
  const clientId = googleOAuthClientId()

  if (!clientId || !googleOAuthClientSecret()) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Google sign-in is not configured'
        },
        ok: false
      },
      { status: 503 }
    )
  }

  const state = randomBytes(24).toString('base64url')
  const redirectTo = safeRedirectPath(request.nextUrl.searchParams.get('redirectTo'))
  const response = NextResponse.redirect(
    buildGoogleAuthorizeUrl({
      clientId,
      redirectUri: resolveGoogleRedirectUri(),
      state
    })
  )

  setTemporaryCookie(response, stateCookie, state)
  setTemporaryCookie(response, redirectCookie, redirectTo)

  return response
}

export async function finishGoogleOAuth(request: NextRequest) {
  const redirectTo = safeRedirectPath(request.cookies.get(redirectCookie)?.value)
  const response = NextResponse.redirect(new URL(redirectTo, request.url))

  response.cookies.delete(stateCookie)
  response.cookies.delete(redirectCookie)

  const expectedState = request.cookies.get(stateCookie)?.value
  const state = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    logWarn('auth.google.denied', { error })
    return response
  }

  if (!expectedState || !state || expectedState !== state) {
    logWarn('auth.google.invalid_state')
    return response
  }

  if (!code) {
    logWarn('auth.google.missing_code')
    return response
  }

  try {
    const userInfo = await exchangeGoogleCode(code)
    const email = normalizeEmail(userInfo.email ?? '')

    if (!userInfo.email_verified || !isValidEmail(email)) {
      logWarn('auth.google.unverified_email', { email })
      return response
    }

    const user = await findOrCreateGoogleUser({
      email,
      name: normalizeGoogleName(userInfo.name)
    })

    await createSession(user)
  } catch (error) {
    logError('auth.google.callback.failed', {}, { error })
  }

  return response
}

async function exchangeGoogleCode(code: string): Promise<GoogleUserInfo> {
  const tokenResponse = await fetch(googleTokenUrl, {
    body: new URLSearchParams({
      client_id: googleOAuthClientId() ?? '',
      client_secret: googleOAuthClientSecret() ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: resolveGoogleRedirectUri()
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    method: 'POST'
  })

  const tokenBody = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string
  } | null

  if (!tokenResponse.ok || !tokenBody?.access_token) {
    throw new Error('Google token exchange failed')
  }

  const userInfoResponse = await fetch(googleUserInfoUrl, {
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`
    }
  })
  const userInfo = (await userInfoResponse
    .json()
    .catch(() => null)) as GoogleUserInfo | null

  if (!userInfoResponse.ok || !userInfo) {
    throw new Error('Google userinfo request failed')
  }

  return userInfo
}

async function findOrCreateGoogleUser({
  email,
  name
}: {
  email: string
  name: string | null
}) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: currentUserSelect
  })

  if (existingUser) {
    if (name && !existingUser.name) {
      return prisma.user.update({
        data: { name },
        select: currentUserSelect,
        where: { id: existingUser.id }
      })
    }

    return existingUser
  }

  return withAvailableUsernameRetry(email, (username) =>
    prisma.user.create({
      data: {
        email,
        name: name ?? undefined,
        username
      },
      select: currentUserSelect
    })
  )
}

function buildGoogleAuthorizeUrl({
  clientId,
  redirectUri,
  state
}: {
  clientId: string
  redirectUri: string
  state: string
}) {
  const url = new URL(googleAuthorizeUrl)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return url
}

function resolveGoogleRedirectUri() {
  return googleOAuthRedirectUri() ?? `${platformBaseUrl()}/api/auth/google/callback`
}

function setTemporaryCookie(response: NextResponse, name: string, value: string) {
  response.cookies.set(name, value, {
    httpOnly: true,
    maxAge: stateTtlSeconds,
    path: '/',
    sameSite: 'lax',
    secure: isProductionEnv()
  })
}

function safeRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/home'
  }

  return value
}

function normalizeGoogleName(value: string | undefined) {
  const name = value?.trim()
  return name ? name.slice(0, 120) : null
}
