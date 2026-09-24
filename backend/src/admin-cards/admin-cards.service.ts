import { ConflictException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { ImagesService } from '../images/images.service';
import { toPublicCard } from '../public-card';
import { readDraftInput, toEditableDraft } from './card-draft.input';
import { readNewCard } from './create-card.input';

interface CardSummaryRow {
  id: string;
  slug: string;
  status: 'draft' | 'published';
  updated_at: Date;
  display_name: string;
  job_title: string;
  organization: string;
  has_unpublished_changes: boolean;
}

interface CardDetailRow extends CardSummaryRow {
  draft: unknown;
}

function checkCardId(id: string): void {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    throw new NotFoundException('Визитка не найдена.');
  }
}

// Список получает только нужные поля, а не весь черновик с контактами.
const summaryColumns = `id, slug, status, updated_at,
  concat_ws(' ', nullif(draft->>'lastName', ''),
    nullif(draft->>'firstName', ''), nullif(draft->>'middleName', '')) AS display_name,
  draft->'jobTitle'->>'value' AS job_title,
  draft->'organization'->>'value' AS organization,
  (status = 'published' AND draft IS DISTINCT FROM published_snapshot) AS has_unpublished_changes`;

@Injectable()
export class AdminCardsService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.EDITOR_DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 3000,
    query_timeout: 5000,
    statement_timeout: 5000,
    application_name: 'digital-cards-editor',
  });

  constructor(private readonly images: ImagesService) {
    this.pool.on('error', () => {
      console.error('Соединение с базой личных визиток прервано.');
    });
  }

  async list(userId: string) {
    const result = await this.pool.query<CardSummaryRow>(
      `SELECT ${summaryColumns} FROM cards
       WHERE owner_user_id = $1 ORDER BY updated_at DESC, id DESC`,
      [userId],
    );

    return result.rows.map(row => this.toSummary(row));
  }

  async create(userId: string, body: unknown) {
    const input = readNewCard(body);
    await this.images.checkDraftImages(userId, input.draft);

    const draftJson = JSON.stringify(input.draft);

    for (let index = 0; index < 1000; index += 1) {
      let slug = input.slug;

      if (index > 0) {
        slug = `${input.slug}-${index}`;
      }

      // Уникальность проверяет БД: два одновременных запроса не займут один адрес.
      const result = await this.pool.query<CardSummaryRow>(
        `INSERT INTO cards(slug, draft, owner_user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO NOTHING
         RETURNING ${summaryColumns}`,
        [slug, draftJson, userId],
      );
      const row = result.rows[0];

      if (row) {
        return this.toSummary(row);
      }
    }

    throw new ConflictException('Не удалось создать адрес. Повторите создание визитки.');
  }

  async getDraft(userId: string, id: string) {
    checkCardId(id);
    const result = await this.pool.query<CardDetailRow>(
      `SELECT ${summaryColumns}, draft FROM cards WHERE id = $1 AND owner_user_id = $2`,
      [id, userId],
    );
    const row = result.rows[0];

    if (!row) {
      // Одинаковый ответ для отсутствующей и чужой записи не раскрывает её существование.
      throw new NotFoundException('Визитка не найдена.');
    }

    return {
      ...this.toSummary(row),
      draft: toEditableDraft(row.draft),
    };
  }

  async updateDraft(userId: string, id: string, body: unknown) {
    checkCardId(id);
    const draft = readDraftInput(body);
    await this.images.checkDraftImages(userId, draft);
    const result = await this.pool.query<CardDetailRow>(
      `UPDATE cards SET draft = $1, updated_at = now()
       WHERE id = $2 AND owner_user_id = $3
       RETURNING ${summaryColumns}, draft`,
      [JSON.stringify(draft), id, userId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new NotFoundException('Визитка не найдена.');
    }

    return {
      ...this.toSummary(row),
      draft: toEditableDraft(row.draft),
    };
  }

  async previewNew(userId: string, body: unknown) {
    const draft = readDraftInput(body);
    await this.images.checkDraftImages(userId, draft);
    return toPublicCard('preview', draft);
  }

  async previewDraft(userId: string, id: string, body: unknown) {
    checkCardId(id);
    const result = await this.pool.query<{ slug: string }>(
      'SELECT slug FROM cards WHERE id = $1 AND owner_user_id = $2',
      [id, userId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new NotFoundException('Визитка не найдена.');
    }

    // Показываем текущую форму без сохранения. Фильтрация та же, что в публичном API.
    const draft = readDraftInput(body);
    await this.images.checkDraftImages(userId, draft);
    return toPublicCard(row.slug, draft);
  }

  async deleteDraft(userId: string, id: string): Promise<void> {
    checkCardId(id);

    // Владелец и статус проверяются внутри одной операции удаления, без промежутка
    // между SELECT и DELETE, в котором визитка могла бы стать опубликованной.
    const result = await this.pool.query<{ deleted: boolean }>(
      'SELECT public.delete_owned_draft($1, $2) AS deleted',
      [id, userId],
    );

    if (!result.rows[0].deleted) {
      throw new NotFoundException('Черновик не найден или недоступен для удаления.');
    }
  }

  async publish(userId: string, id: string) {
    checkCardId(id);

    // Снимок берётся из БД, а не из тела запроса. Публичный API по-прежнему
    // отдаёт его только через whitelist и фильтрацию выключенных полей.
    const result = await this.pool.query<CardSummaryRow>(
      `SELECT ${summaryColumns} FROM public.publish_owned_card($1, $2)`,
      [id, userId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new NotFoundException('Визитка не найдена.');
    }

    return this.toSummary(row);
  }

  async unpublish(userId: string, id: string) {
    checkCardId(id);
    const result = await this.pool.query<CardSummaryRow>(
      `SELECT ${summaryColumns} FROM public.unpublish_owned_card($1, $2)`,
      [id, userId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new NotFoundException('Опубликованная визитка не найдена.');
    }

    return this.toSummary(row);
  }

  private toSummary(row: CardSummaryRow) {
    return {
      id: row.id,
      slug: row.slug,
      displayName: row.display_name ?? '',
      jobTitle: row.job_title ?? '',
      organization: row.organization ?? '',
      status: row.status,
      hasUnpublishedChanges: row.has_unpublished_changes,
      publicUrl: `${process.env.PUBLIC_CARD_ORIGIN}/${row.slug}`,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
