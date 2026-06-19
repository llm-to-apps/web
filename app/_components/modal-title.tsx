import type { ReactNode } from 'react'
import { Box, Group, Text } from '@mantine/core'

type ModalTitleProps = {
  children: ReactNode
  icon?: ReactNode
}

export function ModalTitle({ children, icon }: ModalTitleProps) {
  return (
    <Group align="center" gap="xs" wrap="nowrap">
      {icon ? (
        <Box component="span" style={{ display: 'inline-flex', flexShrink: 0 }}>
          {icon}
        </Box>
      ) : null}
      <Box>
        <Text fw={700} lh={1.2} size="lg">
          {children}
        </Text>
      </Box>
    </Group>
  )
}
