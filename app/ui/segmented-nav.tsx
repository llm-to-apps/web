import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SegmentedNavItem = {
  href: string;
  icon?: ReactNode;
  isActive: boolean;
  label: string;
};

type SegmentedNavProps = {
  ariaLabel: string;
  items: SegmentedNavItem[];
};

export function SegmentedNav({ ariaLabel, items }: SegmentedNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="mt-5 inline-grid grid-cols-[repeat(var(--segment-count),minmax(128px,1fr))] gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
      style={{ '--segment-count': items.length } as React.CSSProperties}
    >
      {items.map((item) => (
        <Link
          aria-current={item.isActive ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-bold text-slate-500 no-underline transition-[background-color,color,box-shadow] duration-150 ease-out',
            item.isActive ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-950'
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
