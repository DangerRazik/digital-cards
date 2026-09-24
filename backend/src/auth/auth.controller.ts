import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { AuthService } from './auth.service';
import { AuthRequestGuard } from './auth-request.guard';
import { SessionGuard } from './session.guard';
import { readSessionToken, sessionLifetimeSeconds, writeSessionCookie } from './session-cookie';
import type { AuthRequest } from './auth.types';

@Controller('admin/auth')
@UseGuards(AuthRequestGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) response: ServerResponse) {
    const result = await this.auth.register(body);
    writeSessionCookie(response, result.token, sessionLifetimeSeconds);

    return result.user;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const result = await this.auth.login(body, readSessionToken(request));
    writeSessionCookie(response, result.token, sessionLifetimeSeconds);

    return result.user;
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthRequest) {
    return request.user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse) {
    // Повторный выход безопасен, даже если сессия уже истекла.
    await this.auth.logout(readSessionToken(request));
    writeSessionCookie(response, '', 0);
  }
}
