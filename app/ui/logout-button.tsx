'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from './button';
import { useI18n } from './i18n-provider';

export function LogoutButton() {
  const { t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function logout() {
    setIsSubmitting(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  return (
    <Button
      aria-label={t.logout.signOut}
      className="size-8 min-h-8 p-0"
      loading={isSubmitting}
      onClick={logout}
      title={t.logout.signOut}
      variant="ghost"
    >
      <LogOut size={16} />
    </Button>
  );
}
