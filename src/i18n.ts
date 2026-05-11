import {getRequestConfig} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {defaultLocale, isLocale} from './i18n/routing';

export default getRequestConfig(async ({locale, requestLocale}) => {
  const requested = locale ?? await requestLocale ?? defaultLocale;
  if (!isLocale(requested)) notFound();

  return {
    locale: requested,
    messages: (await import(`../messages/${requested}.json`)).default
  };
});
