'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Breadcrumbs, Button } from '@mantine/core'
import { ChevronRight, Home } from 'lucide-react'
import { BreadcrumbLabel } from './breadcrumb-label'
import { useI18n } from './i18n-provider'

type BreadcrumbItem = {
  href: string
  label: string
}

export function AppBreadcrumbs() {
  const pathname = usePathname()
  const { t } = useI18n()

  if (pathname === '/home' || pathname.startsWith('/apps/')) {
    return null
  }

  const item = getBreadcrumbItem(pathname, {
    apps: t.tabs.apps,
    files: t.files.title,
    home: t.navigation.home,
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
        {t.navigation.home}
      </Button>
      <BreadcrumbLabel>{item.label}</BreadcrumbLabel>
    </Breadcrumbs>
  )
}

function getBreadcrumbItem(
  pathname: string,
  labels: {
    apps: string
    files: string
    home: string
    settings: string
    store: string
  }
): BreadcrumbItem | null {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/home'
  const routeLabels: Record<string, string> = {
    apps: labels.apps,
    files: labels.files,
    home: labels.home,
    settings: labels.settings,
    store: labels.store
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
