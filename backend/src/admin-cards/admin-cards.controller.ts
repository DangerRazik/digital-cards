import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthRequestGuard } from '../auth/auth-request.guard';
import { SessionGuard } from '../auth/session.guard';
import type { AuthRequest } from '../auth/auth.types';
import { AdminCardsService } from './admin-cards.service';

@Controller('admin/cards')
@UseGuards(AuthRequestGuard, SessionGuard)
export class AdminCardsController {
  constructor(private readonly cards: AdminCardsService) {}

  @Get()
  list(@Req() request: AuthRequest) {
    // SessionGuard уже проверил сессию; id из query/body здесь не используется.
    return this.cards.list(request.user!.id);
  }

  @Post()
  create(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.cards.create(request.user!.id, body);
  }

  @Post('preview')
  @HttpCode(200)
  previewNew(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.cards.previewNew(request.user!.id, body);
  }

  @Get(':id/draft')
  getDraft(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.cards.getDraft(request.user!.id, id);
  }

  @Put(':id/draft')
  updateDraft(@Req() request: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.cards.updateDraft(request.user!.id, id, body);
  }

  @Post(':id/preview')
  @HttpCode(200)
  previewDraft(@Req() request: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.cards.previewDraft(request.user!.id, id, body);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.cards.publish(request.user!.id, id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.cards.unpublish(request.user!.id, id);
  }

  @Delete(':id/draft')
  @HttpCode(204)
  deleteDraft(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.cards.deleteDraft(request.user!.id, id);
  }
}
