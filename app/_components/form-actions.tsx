import type { ReactNode } from 'react'
import { Group } from '@mantine/core'

type FormActionsProps = {
  children: ReactNode
}

export function FormActions({ children }: FormActionsProps) {
  return (
    <Group justify="flex-end" mt="md">
      {children}
    </Group>
  )
}
