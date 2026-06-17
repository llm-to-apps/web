export function formatUsageSummary(creditsUsed: number) {
  if (creditsUsed <= 0) {
    return null
  }

  const formattedCredits = formatCredits(creditsUsed)

  return {
    title: `${formattedCredits} credits used`,
    total: `${formattedCredits} ₵`
  }
}

export function formatInitialUsage(
  usage:
    | {
        creditsUsed: number
      }
    | null
    | undefined
) {
  if (!usage || usage.creditsUsed <= 0) {
    return null
  }

  return {
    creditsUsed: usage.creditsUsed
  }
}

export function formatCreditsUsed(value: unknown) {
  const numericValue = Number(value ?? 0)
  return Math.ceil(Math.abs(Math.min(numericValue, 0)))
}

export function formatCredits(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(value)
}
