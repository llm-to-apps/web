import { Text } from '@mantine/core'

export function BreadcrumbLabel({ children }: { children: string }) {
  return (
    <Text
      c="dimmed"
      component="span"
      size="sm"
      style={{
        display: 'block',
        lineHeight: 1.4,
        maxWidth: 'min(52vw, 520px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </Text>
  )
}
