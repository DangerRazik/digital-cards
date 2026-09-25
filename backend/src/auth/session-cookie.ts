import type { IncomingMessage, ServerResponse } from 'node:http';

export const sessionLifetimeSeconds = 7 * 24 * 60 * 60;
const cookieName = 'cards_session';

export function readSessionToken(request: IncomingMessage): string | null {
  const cookies = request.headers.cookie?.split(';') ?? [];

  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');

    if (name === cookieName && /^[a-f0-9]{64}$/.test(value)) {
      return value;
    }
  }

  return null;
}

export function writeSessionCookie(response: ServerResponse, token: string, maxAge: number): void {
  const attributes = [
    `${cookieName}=${token}`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ];

  // HTTP исключение включается явно для внутреннего тестового сервера.
  // Domain не задаём; Path ограничивает отправку cookie административным API.
  const internalHttp = process.env.INTERNAL_HTTP === 'true'
    && process.env.ADMIN_ORIGIN?.startsWith('http://');

  if (process.env.NODE_ENV === 'production' && !internalHttp) {
    attributes.push('Secure');
  }

  response.setHeader('Set-Cookie', attributes.join('; '));
}
