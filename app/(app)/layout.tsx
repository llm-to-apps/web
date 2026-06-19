'use client'

import type { ReactNode } from 'react'
import { AppLayoutShell } from '../_components/app-layout-shell'
import { SessionGate } from '../_components/session-gate'

export default function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      {(session) => (
        <AppLayoutShell
          siteHref="/home"
          usageSummary={session.usageSummary}
          user={session.user}
        >
          {children}
        </AppLayoutShell>
      )}
    </SessionGate>
  )
}
