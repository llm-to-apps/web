import { cookies, headers } from 'next/headers';
import { defaultLocale, isLocale, localeCookieName, type Locale } from './config';
import { getDictionary } from './dictionaries';

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;

  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const headerStore = await headers();
  const acceptLanguage = headerStore.get('accept-language') ?? '';
  const detectedLocale = acceptLanguage
    .split(',')
    .map((part) => part.trim().split(';')[0]?.split('-')[0])
    .find(isLocale);

  return detectedLocale ?? defaultLocale;
}

export async function getRequestDictionary() {
  return getDictionary(await getRequestLocale());
}

