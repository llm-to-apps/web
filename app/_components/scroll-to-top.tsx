'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function ScrollToTop() {
  const pathname = usePathname()

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 })
  }, [pathname])

  return null
}
