import {getRequestConfig} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {defaultLocale, isLocale} from './i18n/routing';
import {timeZoneForLocale} from './lib/time/localeZone';

export default getRequestConfig(async ({locale, requestLocale}) => {
  const requested = locale ?? await requestLocale ?? defaultLocale;
  if (!isLocale(requested)) notFound();

  return {
    locale: requested,
    // 展示时区跟界面语言走（ja=日本 / zh=北京 / en=加州），不跟运行环境走。
    // 不设这一项时 next-intl 回落到服务器时区：本地是 PDT、Vercel 上是 UTC，
    // 同一条记录在开发机和线上会渲染成不同时刻。
    timeZone: timeZoneForLocale(requested),
    messages: (await import(`../messages/${requested}.json`)).default
  };
});
