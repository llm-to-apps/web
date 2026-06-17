'use client';

import { SegmentedControl, Select } from '@mantine/core';
import { Globe2 } from 'lucide-react';
import { locales, type Locale } from '../../lib/i18n/config';
import { useI18n } from './i18n-provider';

type LanguageSwitcherProps = {
  variant?: 'select' | 'segmented';
};

export function LanguageSwitcher({ variant = 'select' }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();
  const data = locales.map((candidate) => ({
    label: candidate.toUpperCase(),
    value: candidate
  }));

  if (variant === 'segmented') {
    return (
      <SegmentedControl
        aria-label={t.language.label}
        data={data}
        onChange={(value) => setLocale(value as Locale)}
        value={locale}
      />
    );
  }

  return (
    <Select
      aria-label={t.language.label}
      data={data}
      leftSection={<Globe2 size={15} />}
      onChange={(value) => {
        if (value) {
          setLocale(value as Locale);
        }
      }}
      value={locale}
      w={120}
    />
  );
}
