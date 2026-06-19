'use client'

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { useRouter } from 'next/navigation'
import {
  defaultLocale,
  isLocale,
  localeCookieName,
  type Locale
} from '@/shared/i18n/config'
import { dictionaries, formatMessage, type Dictionary } from '@/shared/i18n/dictionaries'

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Dictionary
  format: (message: string, values?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

type I18nProviderProps = {
  children: ReactNode
  initialLocale?: Locale
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const router = useRouter()
  const [locale, setLocaleState] = useState<Locale>(() =>
    resolveInitialLocale(initialLocale)
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<I18nContextValue>(() => {
    function setLocale(nextLocale: Locale) {
      setLocaleState(nextLocale)
      document.cookie = `${localeCookieName}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`
      document.documentElement.lang = nextLocale
      router.refresh()
    }

    return {
      locale,
      setLocale,
      t: dictionaries[locale],
      format: formatMessage
    }
  }, [locale, router])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

function resolveInitialLocale(initialLocale: Locale | undefined) {
  if (isLocale(initialLocale)) {
    return initialLocale
  }

  return defaultLocale
}

export function useI18n() {
  const value = useContext(I18nContext)

  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider')
  }

  return value
}
