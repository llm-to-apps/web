import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  authenticateAuthToken: vi.fn(),
  getCurrentUser: vi.fn(),
  googleOAuthClientId: vi.fn(),
  googleOAuthClientSecret: vi.fn(),
  googleOAuthEnabled: vi.fn(),
  isProductionEnv: vi.fn(),
  platformBaseUrl: vi.fn(),
  prisma: {
    appTemplate: {
      findUnique: vi.fn()
    },
    project: {
      findFirst: vi.fn()
    },
    projectIntegrationGrant: {
      findUnique: vi.fn()
    }
  }
}))

vi.mock('@/server/auth', () => ({
  getCurrentUser: mocks.getCurrentUser
}))

vi.mock('@/server/auth/tokens', () => ({
  authenticateAuthToken: mocks.authenticateAuthToken
}))

vi.mock('@/server/db', () => ({
  prisma: mocks.prisma
}))

vi.mock('@/server/env', () => ({
  authTokenEncryptionSecret: () => 'integration-secret',
  googleOAuthClientId: mocks.googleOAuthClientId,
  googleOAuthClientSecret: mocks.googleOAuthClientSecret,
  googleOAuthEnabled: mocks.googleOAuthEnabled,
  isProductionEnv: mocks.isProductionEnv,
  oauthSigningSecret: () => 'oauth-secret',
  platformBaseUrl: mocks.platformBaseUrl
}))

describe('project integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticateAuthToken.mockResolvedValue({
      projectId: 'project_123',
      subjectType: 'project',
      tokenId: 'token_123'
    })
    mocks.getCurrentUser.mockResolvedValue({
      email: 'user@example.com',
      id: 'user_123',
      name: 'User'
    })
    mocks.googleOAuthClientId.mockReturnValue('google-client-id')
    mocks.googleOAuthClientSecret.mockReturnValue('google-client-secret')
    mocks.googleOAuthEnabled.mockReturnValue(true)
    mocks.isProductionEnv.mockReturnValue(true)
    mocks.platformBaseUrl.mockReturnValue('https://os7.dev')
    mocks.prisma.project.findFirst.mockResolvedValue(project())
    mocks.prisma.appTemplate.findUnique.mockResolvedValue({
      manifest: manifest()
    })
    mocks.prisma.projectIntegrationGrant.findUnique.mockResolvedValue(null)
  })

  it('starts Google OAuth for a manifest-defined on-demand integration', async () => {
    const { handleProjectIntegrationConnectGet } = await import('./index')
    const response = await handleProjectIntegrationConnectGet(
      new NextRequest(
        'https://os7.dev/api/projects/project_123/integrations/googleCalendar/connect?redirect_uri=https%3A%2F%2Fcalendar.example.com%2Fsettings'
      ),
      params()
    )
    const location = response.headers.get('location') ?? ''
    const setCookie = response.headers.getSetCookie().join('\n')

    expect(response.status).toBe(307)
    expect(location).toContain('https://accounts.google.com/o/oauth2/v2/auth')
    expect(location).toContain('client_id=google-client-id')
    expect(location).toContain(
      'redirect_uri=https%3A%2F%2Fos7.dev%2Fapi%2Fintegrations%2Fgoogle%2Fcallback'
    )
    expect(location).toContain(
      'scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly'
    )
    expect(location).toContain('access_type=offline')
    expect(setCookie).toContain('os7_integration_oauth_state=')
  })

  it('rejects connect when the integration is not declared by the template manifest', async () => {
    mocks.prisma.appTemplate.findUnique.mockResolvedValue({
      manifest: {
        ...manifest(),
        integrations: {}
      }
    })

    const { handleProjectIntegrationConnectGet } = await import('./index')
    const response = await handleProjectIntegrationConnectGet(
      new NextRequest(
        'https://os7.dev/api/projects/project_123/integrations/googleCalendar/connect'
      ),
      params()
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: 'Integration not found'
      },
      ok: false
    })
  })

  it('requires project service auth for S2S integration status', async () => {
    mocks.authenticateAuthToken.mockResolvedValue(null)

    const { handleS2SProjectIntegrationStatusGet } = await import('./index')
    const response = await handleS2SProjectIntegrationStatusGet(
      new NextRequest(
        'https://os7.dev/api/s2s/projects/project_123/integrations/googleCalendar/status?userId=user_123',
        {
          headers: {
            authorization: 'Bearer bad-token'
          }
        }
      ),
      params()
    )

    expect(response.status).toBe(401)
  })

  it('reports S2S integration status without exposing provider tokens', async () => {
    mocks.prisma.projectIntegrationGrant.findUnique.mockResolvedValue({
      expiresAt: new Date('2026-06-21T12:00:00.000Z'),
      provider: 'google',
      revokedAt: null,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      updatedAt: new Date('2026-06-21T11:00:00.000Z')
    })

    const { handleS2SProjectIntegrationStatusGet } = await import('./index')
    const response = await handleS2SProjectIntegrationStatusGet(
      new NextRequest(
        'https://os7.dev/api/s2s/projects/project_123/integrations/googleCalendar/status?userId=user_123',
        {
          headers: {
            authorization: 'Bearer service-token'
          }
        }
      ),
      params()
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        connected: true,
        expiresAt: '2026-06-21T12:00:00.000Z',
        integration: {
          mode: 'on_demand',
          provider: 'google',
          required: false,
          scopes: ['https://www.googleapis.com/auth/calendar.readonly']
        },
        provider: 'google',
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        updatedAt: '2026-06-21T11:00:00.000Z'
      },
      ok: true
    })
  })
})

function params() {
  return {
    params: {
      integrationId: 'googleCalendar',
      projectId: 'project_123'
    }
  }
}

function project() {
  return {
    devDomain: null,
    devUrl: null,
    domain: 'calendar.example.com',
    id: 'project_123',
    templateId: 'calendar-template',
    url: 'https://calendar.example.com'
  }
}

function manifest() {
  return {
    integrations: {
      googleCalendar: {
        mode: 'on_demand',
        provider: 'google',
        required: false,
        scopes: ['https://www.googleapis.com/auth/calendar.readonly']
      }
    }
  }
}
