import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  workers: process.env.RUN_DB_E2E === '1' ? 1 : undefined,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: 'http://127.0.0.1:3107',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'next dev --hostname 127.0.0.1 --port 3107',
    env: {
      AUTH_ACCEPT_ANY_EMAIL_CODE: process.env.AUTH_ACCEPT_ANY_EMAIL_CODE ?? 'true',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'test-auth-secret',
      DATABASE_URL:
        process.env.DATABASE_URL ?? `file:${process.cwd()}/prisma/test-e2e.db`,
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? '.next-e2e',
      OAUTH_INTERNAL_BASE_URL:
        process.env.OAUTH_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3107',
      PLATFORM_BASE_URL: process.env.PLATFORM_BASE_URL ?? 'http://127.0.0.1:3107',
      PLATFORM_DOMAIN: process.env.PLATFORM_DOMAIN ?? 'localhost',
      PROJECT_DEV_AGENT_MODEL: process.env.PROJECT_DEV_AGENT_MODEL ?? 'test',
      PROJECT_PUBLIC_SCHEME: process.env.PROJECT_PUBLIC_SCHEME ?? 'http',
      PROJECT_USE_AGENT_MODEL: process.env.PROJECT_USE_AGENT_MODEL ?? 'test',
      REDIS_URL: process.env.REDIS_URL ?? '',
      RESEND_API_KEY: process.env.RESEND_API_KEY ?? ''
    },
    reuseExistingServer: !process.env.CI && process.env.RUN_DB_E2E !== '1',
    timeout: 60_000,
    url: 'http://127.0.0.1:3107'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
