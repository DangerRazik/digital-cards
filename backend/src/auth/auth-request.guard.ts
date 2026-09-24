import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { getClientAddress, getLoginKey, RequestLimiter } from './request-limits';
import type { AuthRequest } from './auth.types';

@Injectable()
export class AuthRequestGuard implements CanActivate {
  private readonly limiter = new RequestLimiter();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const response = context.switchToHttp().getResponse();
    response.setHeader('Cache-Control', 'no-store');

    if (request.method === 'GET') {
      return true;
    }

    // SameSite недостаточно для соседних поддоменов: проверяем точный origin кабинета.
    if (request.headers.origin !== process.env.ADMIN_ORIGIN) {
      throw new ForbiddenException('Запрос должен быть отправлен из личного кабинета.');
    }

    const contentType = request.headers['content-type']?.split(';')[0].trim();

    const isImageUpload = request.method === 'POST' && request.url?.split('?')[0] === '/api/admin/images';
    const expectedType = isImageUpload ? 'multipart/form-data' : 'application/json';

    if (contentType !== expectedType) {
      throw new UnsupportedMediaTypeException('Неподдерживаемый формат запроса.');
    }

    const route = request.url?.split('?')[0];
    const isLogin = route === '/api/admin/auth/login';
    const isRegistration = route === '/api/admin/auth/register';

    // Редактирование и загрузки ограничиваются отдельно, после проверки сессии.
    if (!isLogin && !isRegistration) {
      return true;
    }

    const address = getClientAddress(request);
    const duration = 15 * 60 * 1000;
    let retryAfter: number;

    if (isLogin) {
      retryAfter = this.limiter.consume(`login-network:${address}`, 300, duration);
      if (!retryAfter) {
        const body = context.switchToHttp().getRequest<{ body?: unknown }>().body;
        retryAfter = this.limiter.consume(getLoginKey(address, body), 20, duration);
      }
    } else {
      retryAfter = this.limiter.consume(`register:${address}`, 60, duration);
    }

    if (retryAfter) {
      response.setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Слишком много попыток входа или регистрации. Попробуйте позже.', 429);
    }
    return true;
  }
}
