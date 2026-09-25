import { isIP } from 'node:net';

function isPrivateAddress(host: string): boolean {
  if (isIP(host) !== 4) {
    return false;
  }

  const [first, second] = host.split('.').map(Number);
  return first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

export function validateSiteOrigins(environment: NodeJS.ProcessEnv): void {
  const admin = new URL(environment.ADMIN_ORIGIN || '');
  const publicSite = new URL(environment.PUBLIC_CARD_ORIGIN || '');

  for (const [url, value] of [
    [admin, environment.ADMIN_ORIGIN],
    [publicSite, environment.PUBLIC_CARD_ORIGIN],
  ] as const) {
    if (url.origin !== value || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Адрес сайта должен быть HTTP/HTTPS origin без пути.');
    }
  }

  if (admin.origin === publicSite.origin) {
    throw new Error('Кабинет и публичный сайт должны иметь разные адреса.');
  }

  if (environment.INTERNAL_HTTP === 'true') {
    // Этот режим предназначен для тестового сервера по частному IP, не для интернета.
    for (const url of [admin, publicSite]) {
      if (url.protocol !== 'http:' || !isPrivateAddress(url.hostname)) {
        throw new Error('Внутренний HTTP требует частные IPv4-адреса сайтов.');
      }
    }
    return;
  }

  if (environment.NODE_ENV === 'production') {
    if (admin.protocol !== 'https:' || publicSite.protocol !== 'https:') {
      throw new Error('В production кабинет и публичные визитки должны работать по HTTPS.');
    }
  }
}
