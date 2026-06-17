'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Breadcrumbs, Button, Text } from '@mantine/core'
import { ChevronRight, Home } from 'lucide-react'
import { useI18n } from './i18n-provider'

type BreadcrumbItem = {
  href: string
  label: string
}

export function AppBreadcrumbs() {
  const pathname = usePathname()
  const { t } = useI18n()

  if (pathname.startsWith('/apps/')) {
    return null
  }

  const item = getBreadcrumbItem(pathname, {
    home: t.tabs.apps,
    settings: t.settings.title,
    store: t.tabs.store
  })

  if (!item) {
    return null
  }

  return (
    <Breadcrumbs separator={<ChevronRight size={14} />}>
      <Button
        component={Link}
        href="/home"
        leftSection={<Home size={15} />}
        size="compact-sm"
        variant="subtle"
      >
        Home
      </Button>
      <Text c="dimmed">{item.label}</Text>
    </Breadcrumbs>
  )
}

function getBreadcrumbItem(
  pathname: string,
  labels: {
    home: string
    settings: string
    store: string
  }
): BreadcrumbItem | null {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/home'
  const routeLabels: Record<string, string> = {
    home: labels.home,
    settings: labels.settings,
    store: labels.store
  }

  if (normalizedPathname === '/home') {
    return { href: '/home', label: labels.home }
  }

  const segments = normalizedPathname.split('/').filter(Boolean)
  const segment = segments.at(-1)

  return segment
    ? {
        href: normalizedPathname,
        label: routeLabels[segment] ?? formatSegmentLabel(segment)
      }
    : null
}

function formatSegmentLabel(segment: string) {
  return segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
