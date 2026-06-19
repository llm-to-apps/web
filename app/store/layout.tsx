import type { ReactNode } from 'react'
import { PublicAppLayout } from '../_components/public-app-layout'

export default function PublicStoreLayout({ children }: { children: ReactNode }) {
  return <PublicAppLayout siteHref="/store">{children}</PublicAppLayout>
}
