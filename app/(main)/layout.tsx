import type { ReactNode } from 'react'
import { MainAppLayout } from '@/app/_components/main-app-layout'

export default function MainLayout({ children }: { children: ReactNode }) {
  return <MainAppLayout>{children}</MainAppLayout>
}
