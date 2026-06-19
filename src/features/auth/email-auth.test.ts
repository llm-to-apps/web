import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearEmailLoginCode: vi.fn(),
  createEmailLoginCode: vi.fn(),
  createSession: vi.fn(),
  isDevelopmentEmailCodeEnabled: vi.fn(),
  logError: vi.fn(),
  prisma: {
    user: {
      upsert: vi.fn()
    }
  },
  sendEmail: vi.fn(),
  verifyEmailLoginCode: vi.fn(),
  withAvailableUsernameRetry: vi.fn()
}))

vi.mock('@/server/db', () => ({
  prisma: mocks.prisma
}))

vi.mock('@/server/auth', () => ({
  createSession: mocks.createSession,
  isDevelopmentEmailCodeEnabled: mocks.isDevelopmentEmailCodeEnabled,
  isValidEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  normalizeEmail: (email: string) => email.trim().toLowerCase()
}))

vi.mock('@/server/auth/email-login-codes', () => ({
  clearEmailLoginCode: mocks.clearEmailLoginCode,
  createEmailLoginCode: mocks.createEmailLoginCode,
  verifyEmailLoginCode: mocks.verifyEmailLoginCode
}))

vi.mock('@/server/auth/username', () => ({
  withAvailableUsernameRetry: mocks.withAvailableUsernameRetry
}))

vi.mock('@/server/integrations/email', () => ({
  sendEmail: mocks.sendEmail
}))

vi.mock('@/server/logger', () => ({
  logError: mocks.logError
}))

describe('email auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.clearEmailLoginCode.mockResolvedValue(undefined)
    mocks.createEmailLoginCode.mockResolvedValue({ code: '1234' })
    mocks.isDevelopmentEmailCodeEnabled.mockReturnValue(false)
    mocks.prisma.user.upsert.mockResolvedValue(user())
    mocks.sendEmail.mockResolvedValue({})
    mocks.verifyEmailLoginCode.mockResolvedValue(true)
    mocks.withAvailableUsernameRetry.mockImplementation(
      (_email: string, createUser: (username: string) => Promise<unknown>) =>
        createUser('new.user')
    )
  })

  it('starts registration by creating a user, login code, and email', async () => {
    const { handleEmailStartPost } = await import('./email-start')
    const response = await handleEmailStartPost(
      jsonRequest({
        email: ' New.User@Example.COM '
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {},
      ok: true
    })
    expect(mocks.prisma.user.upsert).toHaveBeenCalledWith({
      create: {
        email: 'new.user@example.com',
        username: 'new.user'
      },
      update: {},
      where: {
        email: 'new.user@example.com'
      }
    })
    expect(mocks.createEmailLoginCode).toHaveBeenCalledWith('new.user@example.com')
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Your OS7 sign-in code',
        text: expect.stringContaining('1234'),
        to: 'new.user@example.com'
      })
    )
  })

  it('clears the login code if sending registration email fails', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('provider down'))

    const { handleEmailStartPost } = await import('./email-start')
    const response = await handleEmailStartPost(
      jsonRequest({
        email: 'new.user@example.com'
      })
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'INTERNAL',
        message: 'Failed to send email code'
      },
      ok: false
    })
    expect(mocks.clearEmailLoginCode).toHaveBeenCalledWith('new.user@example.com')
  })

  it('logs in with a valid email code and creates a session', async () => {
    const currentUser = user({
      email: 'new.user@example.com',
      id: 'user_123'
    })
    mocks.prisma.user.upsert.mockResolvedValue(currentUser)

    const { handleEmailVerifyPost } = await import('./email-verify')
    const response = await handleEmailVerifyPost(
      jsonRequest({
        code: '1234',
        email: 'new.user@example.com'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        user: {
          email: 'new.user@example.com',
          id: 'user_123'
        }
      },
      ok: true
    })
    expect(mocks.verifyEmailLoginCode).toHaveBeenCalledWith(
      'new.user@example.com',
      '1234'
    )
    expect(mocks.createSession).toHaveBeenCalledWith(currentUser)
  })

  it('rejects invalid login codes in production mode', async () => {
    mocks.verifyEmailLoginCode.mockResolvedValue(false)
    mocks.isDevelopmentEmailCodeEnabled.mockReturnValue(false)

    const { handleEmailVerifyPost } = await import('./email-verify')
    const response = await handleEmailVerifyPost(
      jsonRequest({
        code: '0000',
        email: 'new.user@example.com'
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid or expired code'
      },
      ok: false
    })
    expect(mocks.createSession).not.toHaveBeenCalled()
  })
})

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/auth/email/start', {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json'
    },
    method: 'POST'
  }) as never
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    aiExperienceLevel: null,
    email: 'new.user@example.com',
    id: 'user_1',
    name: null,
    onboarded: false,
    onboardingGoal: null,
    username: 'new.user',
    vibeCodingExperienceLevel: null,
    ...overrides
  }
}
