export type ProjectDeployErrorDisplayCode = 'deployment_failed' | 'delete_failed'

export function formatProjectDeployErrorForDisplay(
  deployError: string | null,
  status: string
): ProjectDeployErrorDisplayCode | null {
  if (!deployError) {
    return null
  }

  if (status === 'delete_failed') {
    return 'delete_failed'
  }

  return 'deployment_failed'
}
