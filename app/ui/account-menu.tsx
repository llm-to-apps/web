'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LogOut, Settings, UserRound } from 'lucide-react';
import type { CurrentUser } from '@/lib/auth';
import { useI18n } from './i18n-provider';

type AccountMenuProps = {
  user: CurrentUser;
};

export function AccountMenu({ user }: AccountMenuProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const accountName = user.name || user.email;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  async function signOut() {
    setIsSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="account-pill"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        type="button"
      >
        <UserRound size={16} />
        <span>{accountName}</span>
      </button>

      {isOpen ? (
        <div className="account-menu-popover" role="menu">
          <div className="account-menu-user">
            <UserRound size={16} />
            <span>{accountName}</span>
          </div>
          <Link className="account-menu-item" href="/settings" role="menuitem">
            <Settings size={16} />
            {t.settings.title}
          </Link>
          <button
            className="account-menu-item"
            disabled={isSigningOut}
            onClick={() => void signOut()}
            role="menuitem"
            type="button"
          >
            <LogOut size={16} />
            {t.logout.signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}
