import { Text } from '@mantine/core'

export function BreadcrumbLabel({ children }: { children: string }) {
  return (
    <Text
      c="dimmed"
      component="span"
      style={{
        display: 'block',
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
