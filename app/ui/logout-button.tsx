'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';

export function LogoutButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function logout() {
    setIsSubmitting(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  return (
    <button className="ghost-button" type="button" onClick={logout} disabled={isSubmitting}>
      <LogOut size={16} />
      Sign out
    </button>
  );
}
