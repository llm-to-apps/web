import Link from 'next/link';
import { Grid2X2, Store } from 'lucide-react';

type AppTabsProps = {
  active: 'apps' | 'store';
};

export function AppTabs({ active }: AppTabsProps) {
  return (
    <nav className="app-tabs" aria-label="Application sections">
      <Link className={active === 'apps' ? 'active' : ''} href="/">
        <Grid2X2 size={17} />
        Apps
      </Link>
      <Link className={active === 'store' ? 'active' : ''} href="/store">
        <Store size={17} />
        App Store
      </Link>
    </nav>
  );
}
