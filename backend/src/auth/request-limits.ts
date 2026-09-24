import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

interface RequestWindow {
  count: number;
  expiresAt: number;
}

// Лимиты предназначены для одного процесса backend. После перезапуска окна обнуляются.
export class RequestLimiter {
  private readonly windows = new Map<string, RequestWindow>();

  consume(key: string, limit: number, durationMs: number, now = Date.now()): number {
    for (const [storedKey, window] of this.windows) {
      if (window.expiresAt <= now) {
        this.windows.delete(storedKey);
      }
    }

    let window = this.windows.get(key);
    if (!window) {
      if (this.windows.size >= 10000) {
        return Math.ceil(durationMs / 1000);
      }
      window = {
        count: 0,
        expiresAt: now + durationMs,
      };
      this.windows.set(key, window);
    }

    if (window.count >= limit) {
      return Math.max(1, Math.ceil((window.expiresAt - now) / 1000));
    }
    window.count += 1;
    return 0;
  }
}

export function getClientAddress(request: IncomingMessage): string {
  const address = request.socket.remoteAddress ?? 'unknown';
  const localProxy = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
  const forwarded = request.headers['x-real-ip'];

  // Разрешается только для Nginx на этом же сервере, который ПЕРЕЗАПИСЫВАЕТ заголовок.
  if (process.env.TRUST_LOCAL_PROXY === 'true' && localProxy && typeof forwarded === 'string' && isIP(forwarded)) {
    return forwarded;
  }
  return address;
}

export function getLoginKey(address: string, body: unknown): string {
  let email = '';
  if (body && typeof body === 'object' && 'email' in body && typeof body.email === 'string') {
    email = body.email.trim().toLowerCase().slice(0, 254);
  }
  // Не сохраняем адреса электронной почты в ключах лимитера.
  const account = createHash('sha256').update(email).digest('hex');
  return `login:${address}:${account}`;
}
