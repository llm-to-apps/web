'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Group, NavLink, Stack } from '@mantine/core'
import { Bot, PanelsTopLeft } from 'lucide-react'
import { useI18n } from './i18n-provider'

type HeaderNavProps = {
  layout?: 'header' | 'drawer'
  onNavigate?: () => void
}

export function HeaderNav({ layout = 'header', onNavigate }: HeaderNavProps) {
  const pathname = usePathname()
  const { t } = useI18n()
  const items = [
    {
      href: '/home',
      icon: <Bot size={16} />,
      isActive: pathname === '/home',
      label: t.tabs.apps
    },
    {
      href: '/store',
      icon: <PanelsTopLeft size={16} />,
      isActive: pathname === '/store',
      label: t.tabs.store
    }
  ]

  if (layout === 'drawer') {
    return (
      <Stack aria-label={t.tabs.ariaLabel} component="nav" gap="sm">
        {items.map((item) => (
          <NavLink
            aria-current={item.isActive ? 'page' : undefined}
            active={item.isActive}
            component={Link}
            href={item.href}
            key={item.href}
            label={item.label}
            leftSection={item.icon}
            onClick={onNavigate}
          />
        ))}
      </Stack>
    )
  }

  return (
    <Group
      aria-label={t.tabs.ariaLabel}
      component="nav"
      gap={4}
      justify="center"
      visibleFrom="sm"
      wrap="nowrap"
      style={{
        minWidth: 0,
        overflowX: 'auto',
        scrollbarWidth: 'none'
      }}
    >
      {items.map((item) => (
        <NavLink
          aria-current={item.isActive ? 'page' : undefined}
          active={item.isActive}
          component={Link}
          href={item.href}
          key={item.href}
          label={item.label}
          leftSection={item.icon}
          px="sm"
          style={{ flex: '0 0 auto' }}
          w="auto"
        />
      ))}
    </Group>
  )
}
