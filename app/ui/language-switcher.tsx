'use client';

import { Globe2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { locales, type Locale } from '@/lib/i18n/config';
import { useI18n } from './i18n-provider';

type LanguageSwitcherProps = {
  variant?: 'select' | 'segmented';
};

export function LanguageSwitcher({ variant = 'select' }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();

  if (variant === 'segmented') {
    return (
      <div className="language-segmented" aria-label={t.language.label} role="group">
        {locales.map((candidate) => (
          <button
            aria-pressed={locale === candidate}
            className={cn(
              'language-segmented-button',
              locale === candidate ? 'is-active' : ''
            )}
            key={candidate}
            onClick={() => setLocale(candidate)}
            title={t.language[candidate]}
            type="button"
          >
            {candidate.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <label className="language-switcher">
      <Globe2 size={15} />
      <span className="sr-only">{t.language.label}</span>
      <select
        aria-label={t.language.label}
        onChange={(event) => setLocale(event.target.value as Locale)}
        value={locale}
      >
        {locales.map((candidate) => (
          <option key={candidate} value={candidate}>
            {t.language[candidate].toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
