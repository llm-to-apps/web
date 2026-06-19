import type { ReactNode } from 'react'
import { PublicAppLayout } from '../_components/public-app-layout'

export default function PublicHubLayout({ children }: { children: ReactNode }) {
  return <PublicAppLayout siteHref="/hub">{children}</PublicAppLayout>
}
