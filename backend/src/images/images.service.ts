import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DatabaseService } from '../database.service';
import { toPublicCard } from '../public-card';
import { validatePngImage } from './png-image';

const imageUrlPattern = /^\/api\/public\/images\/([a-f0-9-]{36}\.png)$/;

@Injectable()
export class ImagesService {
  private readonly directory = resolve(process.env.UPLOAD_DIRECTORY || 'storage/images');

  constructor(private readonly database: DatabaseService) {}

  async upload(userId: string, buffer?: Buffer) {
    if (!buffer) {
      throw new BadRequestException('Выберите изображение.');
    }
    const image = validatePngImage(buffer);
    const name = `${randomUUID()}.png`;
    await mkdir(this.directory, { recursive: true });
    const filePath = join(this.directory, name);
    await writeFile(filePath, image, { flag: 'wx' });
    try {
      await writeFile(`${filePath}.json`, JSON.stringify({ userId }), { flag: 'wx' });
    } catch (error) {
      await unlink(filePath);
      throw error;
    }
    return { url: `/api/public/images/${name}` };
  }

  async checkOwnership(userId: string, name: string): Promise<void> {
    this.checkName(name);
    try {
      const metadata = JSON.parse(await readFile(join(this.directory, `${name}.json`), 'utf8'));
      if (metadata.userId === userId) {
        return;
      }
    } catch {
      // Один ответ для чужого и отсутствующего изображения.
    }
    throw new NotFoundException('Изображение не найдено.');
  }

  async checkDraftImages(
    userId: string,
    draft: {
      photo: { value: string };
      background: { value: string };
    },
  ) {
    for (const field of [draft.photo, draft.background]) {
      const match = imageUrlPattern.exec(field.value);
      if (match) {
        await this.checkOwnership(userId, match[1]);
      }
    }
  }

  async readPrivate(userId: string, name: string) {
    await this.checkOwnership(userId, name);
    return this.readFile(name);
  }

  async readPublished(name: string) {
    this.checkName(name);
    const url = `/api/public/images/${name}`;
    const result = await this.database.query<{ slug: string; published_snapshot: unknown }>(
      `SELECT slug, published_snapshot FROM published_cards
       WHERE published_snapshot->'photo'->>'value' = $1
          OR published_snapshot->'background'->>'value' = $1`,
      [url],
    );
    for (const row of result.rows) {
      // Проверяем не только публикацию, но и выключенные поля/блоки.
      const card = toPublicCard(row.slug, row.published_snapshot);
      if ([card.photo, card.background].some(field => field.enabled && field.value === url)) {
        return this.readFile(name);
      }
    }
    throw new NotFoundException('Изображение не найдено.');
  }

  private checkName(name: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.png$/.test(name)) {
      throw new NotFoundException('Изображение не найдено.');
    }
  }

  private async readFile(name: string) {
    try {
      const image = await readFile(join(this.directory, name));
      return new StreamableFile(image, { type: 'image/png' });
    } catch {
      throw new NotFoundException('Изображение не найдено.');
    }
  }
}
