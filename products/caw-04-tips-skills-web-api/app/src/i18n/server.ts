import { cookies } from 'next/headers'

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './config'
import { getDictionary, type Dictionary } from './dictionaries'

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export async function getDict(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale()
  return { locale, t: getDictionary(locale) }
}
