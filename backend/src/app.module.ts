import { AdminCardsController } from './admin-cards/admin-cards.controller';
import { AdminCardsService } from './admin-cards/admin-cards.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthRequestGuard } from './auth/auth-request.guard';
import { SessionGuard } from './auth/session.guard';
import { AdminImagesController, PublicImagesController } from './images/images.controller';
import { ImagesService } from './images/images.service';
import { Module } from '@nestjs/common';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { DatabaseService } from './database.service';

@Module({
  controllers: [CardsController, AuthController, AdminCardsController, AdminImagesController, PublicImagesController],
  providers: [
    CardsService,
    DatabaseService,
    AuthService,
    AuthRequestGuard,
    SessionGuard,
    AdminCardsService,
    ImagesService,
  ],
})
export class AppModule {}
