'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Grid2X2, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from './i18n-provider';

export function HeaderNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const items = [
    {
      href: '/home',
      icon: <Grid2X2 size={16} />,
      isActive: pathname === '/home',
      label: t.tabs.apps
    },
    {
      href: '/store',
      icon: <Store size={16} />,
      isActive: pathname === '/store',
      label: t.tabs.store
    }
  ];

  return (
    <nav
      aria-label={t.tabs.ariaLabel}
      className="mr-auto hidden items-center gap-1 md:inline-flex"
    >
      {items.map((item) => (
        <Link
          aria-current={item.isActive ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold text-slate-500 no-underline transition-[background-color,color] duration-150 ease-out hover:bg-slate-50 hover:text-slate-950',
            item.isActive ? 'cursor-default bg-slate-100 text-slate-950 hover:bg-slate-100' : ''
          )}
          href={item.href}
          key={item.href}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
