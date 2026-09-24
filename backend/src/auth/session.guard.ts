import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { readSessionToken } from './session-cookie';
import { RequestLimiter } from './request-limits';
import type { AuthRequest } from './auth.types';

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly limiter = new RequestLimiter();

  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.user = await this.auth.findSessionUser(readSessionToken(request));

    if (request.method !== 'GET') {
      const isUpload = request.url?.split('?')[0] === '/api/admin/images';
      let key = `write:${request.user.id}`;
      let limit = 120;
      if (isUpload) {
        key = `upload:${request.user.id}`;
        limit = 20;
      }
      const retryAfter = this.limiter.consume(key, limit, 60 * 1000);
      if (retryAfter) {
        context.switchToHttp().getResponse().setHeader('Retry-After', String(retryAfter));
        throw new HttpException('Слишком много действий. Подождите немного и повторите.', 429);
      }
    }

    return true;
  }
}
