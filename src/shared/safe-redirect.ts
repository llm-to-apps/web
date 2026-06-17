export function safeRelativeRedirect(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/home'
  }

  try {
    const parsed = new URL(value, 'http://os7.local')

    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/home'
  }
}
