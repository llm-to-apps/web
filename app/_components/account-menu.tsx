'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Avatar, Group, Menu, Text, UnstyledButton } from '@mantine/core'
import { ChevronDown, FileText, LogOut, Settings, UserRound } from 'lucide-react'
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
        <UnstyledButton
          aria-label={accountName}
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            color: 'var(--mantine-color-text)',
            display: 'block',
            maxWidth: 'min(184px, 36vw)',
            padding: '6px 10px'
          }}
        >
          <Group gap="xs" wrap="nowrap">
            <Avatar alt={accountName} radius="xl" size={20}>
              {initials}
            </Avatar>
            <Text
              component="span"
              fw={500}
              style={{
                minWidth: 0
              }}
              truncate
            >
              {accountName}
            </Text>
            <ChevronDown size={12} style={{ flex: '0 0 auto' }} />
          </Group>
        </UnstyledButton>
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
        {user.onboarded ? (
          <>
            <Menu.Item
              component={Link}
              href="/settings"
              leftSection={<Settings size={16} />}
            >
              {t.settings.title}
            </Menu.Item>
            <Menu.Item
              component={Link}
              href="/files"
              leftSection={<FileText size={16} />}
            >
              {t.files.title}
            </Menu.Item>
          </>
        ) : (
          <Menu.Item
            component={Link}
            href="/welcome"
            leftSection={<UserRound size={16} />}
          >
            {t.profile.setupProfile}
          </Menu.Item>
        )}
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
