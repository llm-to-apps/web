import type { ReactNode } from 'react'
import { Box, Group, Text } from '@mantine/core'

type ModalTitleProps = {
  children: ReactNode
  description?: ReactNode
  icon?: ReactNode
}

export function ModalTitle({ children, description, icon }: ModalTitleProps) {
  return (
    <Group align={description ? 'flex-start' : 'center'} gap="xs" wrap="nowrap">
      {icon ? (
        <Box component="span" style={{ display: 'inline-flex', flexShrink: 0 }}>
          {icon}
        </Box>
      ) : null}
      <Box>
        <Text fw={700} lh={1.2}>
          {children}
        </Text>
        {description ? (
          <Text c="dimmed" size="sm">
            {description}
          </Text>
        ) : null}
      </Box>
    </Group>
  )
}
