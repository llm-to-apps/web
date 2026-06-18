'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Avatar, Button, Menu, Text } from '@mantine/core'
import { ChevronDown, FileText, LogOut, Settings } from 'lucide-react'
import type { CurrentUser } from '@/server/auth'
import { useI18n } from './i18n-provider'

type AccountMenuProps = {
  usageSummary?: {
    title: string
    total: string
  } | null
  user: CurrentUser
}

export function AccountMenu({ usageSummary, user }: AccountMenuProps) {
  const { t } = useI18n()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const accountName = user.name || user.email
  const initials =
    accountName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'

  async function signOut() {
    setIsSigningOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.reload()
  }

  return (
    <Menu
      position="bottom-end"
      shadow="md"
      transitionProps={{ transition: 'pop-top-right' }}
      width={260}
      withinPortal
    >
      <Menu.Target>
        <Button
          leftSection={
            <Avatar alt={accountName} radius="xl" size={20}>
              {initials}
            </Avatar>
          }
          maw={{ base: 132, md: 184 }}
          rightSection={<ChevronDown size={12} />}
          variant="subtle"
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {accountName}
          </span>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {usageSummary ? (
          <>
            <Menu.Label>Your balance</Menu.Label>
            <Text px="sm" py={4}>
              {usageSummary.total}
            </Text>
            <Menu.Divider />
          </>
        ) : null}
        <Menu.Item component={Link} href="/settings" leftSection={<Settings size={16} />}>
          {t.settings.title}
        </Menu.Item>
        <Menu.Item component={Link} href="/files" leftSection={<FileText size={16} />}>
          {t.files.title}
        </Menu.Item>
        <Menu.Item
          color="red"
          disabled={isSigningOut}
          leftSection={<LogOut size={16} />}
          onClick={() => void signOut()}
        >
          {t.logout.signOut}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
