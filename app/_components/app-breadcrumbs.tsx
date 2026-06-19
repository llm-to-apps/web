'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { Os7Breadcrumbs, type Os7BreadcrumbItem } from '../../ui-kit/src/os7-breadcrumbs'
import { useI18n } from './i18n-provider'

type BreadcrumbItem = {
  href: string
  label: string
}

type AppBreadcrumbsContextValue = {
  items: BreadcrumbItem[] | null
  setItems: (items: BreadcrumbItem[] | null) => void
}

type AppBreadcrumbsProps = {
  onHomeNavigate?: () => void
}

const AppBreadcrumbsContext = createContext<AppBreadcrumbsContextValue | null>(null)
const rootlessBreadcrumbSections = new Set(['/hub'])

export function AppBreadcrumbsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [items, setItems] = useState<BreadcrumbItem[] | null>(null)
  const value = useMemo(
    () => ({
      items,
      setItems
    }),
    [items]
  )

  useEffect(() => {
    setItems(null)
  }, [pathname])

  return (
    <AppBreadcrumbsContext.Provider value={value}>
      {children}
    </AppBreadcrumbsContext.Provider>
  )
}

export function useAppBreadcrumbItems(items: BreadcrumbItem[] | null) {
  const context = useContext(AppBreadcrumbsContext)
  const setItems = context?.setItems

  useEffect(() => {
    if (!setItems) {
      return
    }

    setItems(items)

    return () => {
      setItems(null)
    }
  }, [items, setItems])
}

export function AppBreadcrumbs({ onHomeNavigate }: AppBreadcrumbsProps = {}) {
  const pathname = usePathname()
  const customBreadcrumbs = useContext(AppBreadcrumbsContext)
  const { t } = useI18n()

  if (pathname === '/home' || pathname.startsWith('/apps/')) {
    return null
  }

  const items =
    customBreadcrumbs?.items ??
    getBreadcrumbItems(pathname, {
      apps: t.tabs.apps,
      files: t.files.title,
      home: t.navigation.home,
      hub: t.tabs.hub,
      new: t.hub.newTopic,
      settings: t.settings.title,
      store: t.tabs.store
    })

  if (
    pathname.startsWith('/hub/') &&
    pathname !== '/hub/new' &&
    !customBreadcrumbs?.items
  ) {
    return null
  }

  if (items.length <= 1) {
    return null
  }

  const showHomeBreadcrumb = shouldShowHomeBreadcrumb(items)

  const breadcrumbItems: Os7BreadcrumbItem[] = [
    ...(showHomeBreadcrumb
      ? [
          {
            href: onHomeNavigate ? undefined : '/home',
            label: t.navigation.home,
            leftSection: <Home size={15} />,
            onClick: onHomeNavigate
          }
        ]
      : []),
    ...items
  ]

  return (
    <Os7Breadcrumbs
      items={breadcrumbItems}
      linkComponent={Link}
      separator={<ChevronRight size={14} />}
    />
  )
}

function getBreadcrumbItems(
  pathname: string,
  labels: {
    apps: string
    files: string
    home: string
    hub: string
    new: string
    settings: string
    store: string
  }
): BreadcrumbItem[] {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/home'
  const routeLabels: Record<string, string> = {
    apps: labels.apps,
    files: labels.files,
    home: labels.home,
    hub: labels.hub,
    new: labels.new,
    settings: labels.settings,
    store: labels.store
  }

  const segments = normalizedPathname.split('/').filter(Boolean)

  return segments.map((segment, index) => ({
    href: `/${segments.slice(0, index + 1).join('/')}`,
    label: routeLabels[segment] ?? formatSegmentLabel(segment)
  }))
}

function shouldShowHomeBreadcrumb(items: BreadcrumbItem[]) {
  const firstHref = items[0]?.href

  return !firstHref || !rootlessBreadcrumbSections.has(firstHref)
}

function formatSegmentLabel(segment: string) {
  return segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
