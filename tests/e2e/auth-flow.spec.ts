import { expect, test } from '@playwright/test'

test('registers with email code, completes onboarding, and reaches home', async ({
  page
}) => {
  const email = `e2e-${Date.now()}@example.com`

  const sessionResponsePromise = page
    .waitForResponse((response) => response.url().endsWith('/api/session'))
    .catch(() => null)
  await page.goto('/')
  await sessionResponsePromise

  const emailInput = page.getByLabel('Email')
  await emailInput.fill(email)
  await expect(emailInput).toHaveValue(email)
  const [startResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/auth/email/start')),
    page.getByRole('button', { name: 'Continue' }).click()
  ])

  expect(startResponse.ok()).toBe(true)
  await expect(startResponse.json()).resolves.toEqual({
    ok: true,
    data: {}
  })

  await expect(page.getByText(`Code sent to ${email}.`)).toBeVisible()
  await page.keyboard.type('1234')

  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()

  await page.getByLabel('Your name').fill('E2E User')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('heading', { name: 'No apps installed' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Store' })).toBeVisible()
})
