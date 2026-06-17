'use client'

import { ActionIcon, Menu } from '@mantine/core'
import { Eraser, MoreHorizontal } from 'lucide-react'
import { useI18n } from '../_components/i18n-provider'

type ChatOptionsMenuProps = {
  disabled?: boolean
  isClearing?: boolean
  onClearHistory: () => void
}

export function ChatOptionsMenu({
  disabled = false,
  isClearing = false,
  onClearHistory
}: ChatOptionsMenuProps) {
  const { t } = useI18n()

  return (
    <Menu position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon
          aria-label={t.chat.optionsAria}
          disabled={disabled}
          title={t.chat.optionsAria}
          variant="subtle"
        >
          <MoreHorizontal size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          color="red"
          disabled={disabled || isClearing}
          leftSection={<Eraser size={16} />}
          onClick={onClearHistory}
        >
          {t.chat.clearAria}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
