import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { toPublicCard } from './public-card';

interface PublishedCardRow {
  slug: string;
  published_snapshot: unknown;
}

@Injectable()
export class CardsService {
  constructor(private readonly database: DatabaseService) { }

  async findPublished(slug: string) {
    const hasValidFormat = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

    if (!hasValidFormat || slug.length > 120) {
      throw new NotFoundException('Визитка не найдена');
    }

    let result;

    try {
      result = await this.database.query<PublishedCardRow>(
        'SELECT slug, published_snapshot FROM published_cards WHERE slug = $1',
        [slug],
      );
    } catch {
      throw new ServiceUnavailableException('Визитка временно недоступна. Попробуйте позже.');
    }

    const row = result.rows[0];

    if (!row) {
      throw new NotFoundException('Визитка не найдена');
    }

    return toPublicCard(row.slug, row.published_snapshot);
  }
}
