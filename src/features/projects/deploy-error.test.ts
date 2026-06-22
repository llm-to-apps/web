import { describe, expect, it } from 'vitest'

import { formatProjectDeployErrorForDisplay } from './deploy-error'

describe('formatProjectDeployErrorForDisplay', () => {
  it('hides internal deployment details', () => {
    const message = formatProjectDeployErrorForDisplay(
      'Project service abc did not become ready within 120000ms: {"tasks":[{"error":"No such image"}]}',
      'failed'
    )

    expect(message).toBe('deployment_failed')
  })

  it('uses a delete-specific message for delete failures', () => {
    expect(formatProjectDeployErrorForDisplay('Docker API error', 'delete_failed')).toBe(
      'delete_failed'
    )
  })

  it('keeps empty deployment errors empty', () => {
    expect(formatProjectDeployErrorForDisplay(null, 'failed')).toBeNull()
  })
})
