import en from '@/messages/en.json';
import de from '@/messages/de.json';
import ru from '@/messages/ru.json';
import type { Locale } from './config';

export const dictionaries = {
  en,
  de,
  ru
} as const;

export type Dictionary = typeof en;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}

export function formatMessage(
  message: string,
  values: Record<string, string | number> = {}
) {
  return message.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}

