import { Controller, Get, Header, Param } from '@nestjs/common';
import { CardsService } from './cards.service';

@Controller('public/cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  findPublished(@Param('slug') slug: string) {
    return this.cards.findPublished(slug);
  }
}
