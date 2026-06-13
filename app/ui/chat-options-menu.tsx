'use client';

import { useEffect, useRef, useState } from 'react';
import { Eraser, MoreHorizontal } from 'lucide-react';
import { Button } from './button';
import { useI18n } from './i18n-provider';

type ChatOptionsMenuProps = {
  disabled?: boolean;
  isClearing?: boolean;
  onClearHistory: () => void;
};

export function ChatOptionsMenu({
  disabled = false,
  isClearing = false,
  onClearHistory
}: ChatOptionsMenuProps) {
  const { t } = useI18n();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function closeOnPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  return (
    <div className="chat-options-menu" ref={menuRef}>
      <Button
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        aria-label={t.chat.optionsAria}
        disabled={disabled}
        onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
        title={t.chat.optionsAria}
        variant="icon"
      >
        <MoreHorizontal size={16} />
      </Button>

      {isMenuOpen ? (
        <div className="account-menu-popover chat-options-popover" role="menu">
          <button
            className="account-menu-item project-settings-danger-item"
            disabled={disabled || isClearing}
            onClick={() => {
              setIsMenuOpen(false);
              onClearHistory();
            }}
            role="menuitem"
            type="button"
          >
            <Eraser size={16} />
            {t.chat.clearAria}
          </button>
        </div>
      ) : null}
    </div>
  );
}
