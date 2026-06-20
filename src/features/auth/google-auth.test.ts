import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

describe('google auth routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not expose Google sign-in until OAuth env is enabled and configured', async () => {
    vi.stubEnv('GOOGLE_OAUTH_ENABLED', '')
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', '')
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', '')

    const { handleAuthProvidersGet } = await import('./providers')
    const response = await handleAuthProvidersGet()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        google: false
      },
      ok: true
    })
  })

  it('exposes Google sign-in when OAuth env is configured', async () => {
    vi.stubEnv('GOOGLE_OAUTH_ENABLED', 'true')
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'google-client-id')
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'google-client-secret')

    const { handleAuthProvidersGet } = await import('./providers')
    const response = await handleAuthProvidersGet()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        google: true
      },
      ok: true
    })
  })

  it('starts Google OAuth with a redirect and state cookies', async () => {
    vi.stubEnv('GOOGLE_OAUTH_ENABLED', 'true')
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'google-client-id')
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'google-client-secret')
    vi.stubEnv('PLATFORM_BASE_URL', 'https://os7.dev')

    const { handleGoogleStartGet } = await import('./google-start')
    const response = await handleGoogleStartGet(
      new NextRequest('https://os7.dev/api/auth/google/start?redirectTo=/hub')
    )
    const location = response.headers.get('location')
    const setCookie = response.headers.getSetCookie().join('\n')

    expect(response.status).toBe(307)
    expect(location).toContain('https://accounts.google.com/o/oauth2/v2/auth')
    expect(location).toContain('client_id=google-client-id')
    expect(location).toContain(
      'redirect_uri=https%3A%2F%2Fos7.dev%2Fapi%2Fauth%2Fgoogle%2Fcallback'
    )
    expect(setCookie).toContain('os7_google_oauth_state=')
    expect(setCookie).toContain('os7_google_oauth_redirect=%2Fhub')
  })

  it('does not start Google OAuth when disabled', async () => {
    vi.stubEnv('GOOGLE_OAUTH_ENABLED', '')
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'google-client-id')
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'google-client-secret')

    const { handleGoogleStartGet } = await import('./google-start')
    const response = await handleGoogleStartGet(
      new NextRequest('https://os7.dev/api/auth/google/start?redirectTo=/hub')
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'NOT_CONFIGURED'
      },
      ok: false
    })
  })

  it('uses the public platform URL after Google callback', async () => {
    vi.stubEnv('PLATFORM_BASE_URL', 'https://os7.dev')

    const { handleGoogleCallbackGet } = await import('./google-callback')
    const request = new NextRequest(
      'http://localhost/api/auth/google/callback?error=access_denied',
      {
        headers: {
          cookie: 'os7_google_oauth_redirect=%2Fhub'
        }
      }
    )
    const response = await handleGoogleCallbackGet(request)

    expect(response.headers.get('location')).toBe('https://os7.dev/hub')
  })
})
