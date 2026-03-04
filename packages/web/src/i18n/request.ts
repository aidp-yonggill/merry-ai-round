import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

export const locales = ['en', 'ko'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

function parseAcceptLanguage(header: string): Locale {
  const preferred = header
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=');
      return { lang: lang.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of preferred) {
    const base = lang.split('-')[0];
    if (locales.includes(base as Locale)) {
      return base as Locale;
    }
  }
  return defaultLocale;
}

export default getRequestConfig(async () => {
  const h = await headers();
  const acceptLanguage = h.get('accept-language') ?? '';
  const locale = parseAcceptLanguage(acceptLanguage);

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
