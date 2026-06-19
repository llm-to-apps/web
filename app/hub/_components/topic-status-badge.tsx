import { Badge, Loader } from '@mantine/core'

export type TopicStatusLabels = {
  analyzing: string
  developed: string
  discussing: string
  inDevelopment: string
}

export function TopicStatusBadge({
  labels,
  status
}: {
  labels: TopicStatusLabels
  status: string
}) {
  return (
    <Badge
      leftSection={
        status === 'analyzing' ? <Loader color="gray" size={14} type="dots" /> : null
      }
      variant="light"
    >
      {topicStatusLabel(status, labels)}
    </Badge>
  )
}

function topicStatusLabel(status: string, labels: TopicStatusLabels) {
  switch (status) {
    case 'analyzing':
      return labels.analyzing
    case 'discussing':
      return labels.discussing
    case 'in_development':
      return labels.inDevelopment
    case 'developed':
      return labels.developed
    default:
      return status
  }
}
