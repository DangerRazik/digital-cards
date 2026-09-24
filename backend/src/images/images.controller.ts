import { Controller, Get, Header, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthRequestGuard } from '../auth/auth-request.guard';
import { SessionGuard } from '../auth/session.guard';
import type { AuthRequest } from '../auth/auth.types';
import { ImagesService } from './images.service';

@Controller('admin/images')
@UseGuards(AuthRequestGuard, SessionGuard)
export class AdminImagesController {
  constructor(private readonly images: ImagesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 } }))
  upload(@Req() request: AuthRequest, @UploadedFile() file?: { buffer: Buffer }) {
    return this.images.upload(request.user!.id, file?.buffer);
  }

  @Get(':name')
  @Header('X-Content-Type-Options', 'nosniff')
  read(@Req() request: AuthRequest, @Param('name') name: string) {
    return this.images.readPrivate(request.user!.id, name);
  }
}

@Controller('public/images')
export class PublicImagesController {
  constructor(private readonly images: ImagesService) {}

  @Get(':name')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  read(@Param('name') name: string) {
    return this.images.readPublished(name);
  }
}
