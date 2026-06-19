import { Box, Loader } from '@mantine/core'
import { Check, CircleAlert } from 'lucide-react'

export type ArtifactStatusLabels = {
  analyzing: string
  checked: string
  error: string
}

export function ArtifactStatusIcon({
  labels,
  status
}: {
  labels: ArtifactStatusLabels
  status: string
}) {
  const label = artifactStatusLabel(status, labels)

  return (
    <Box
      aria-label={label}
      c={artifactStatusColor(status)}
      component="span"
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        height: 20
      }}
      title={label}
    >
      {status === 'checked' ? <Check size={16} /> : null}
      {status === 'error' ? <CircleAlert size={16} /> : null}
      {status === 'analyzing' ? <Loader size={16} type="dots" /> : null}
      {status !== 'checked' && status !== 'error' && status !== 'analyzing'
        ? status
        : null}
    </Box>
  )
}

function artifactStatusColor(status: string) {
  switch (status) {
    case 'checked':
      return 'green'
    case 'error':
      return 'red'
    case 'analyzing':
      return 'gray'
    default:
      return 'gray'
  }
}

function artifactStatusLabel(status: string, labels: ArtifactStatusLabels) {
  switch (status) {
    case 'checked':
      return labels.checked
    case 'error':
      return labels.error
    case 'analyzing':
      return labels.analyzing
    default:
      return status
  }
}
