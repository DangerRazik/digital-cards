require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const configPath = path.resolve(__dirname, '../../.local/db-config.json');
const configContent = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configContent);

process.env.DATABASE_URL = config.publicUrl;

test('API выдаёт только опубликованный снимок и не допускает запись', async t => {
  const admin = new Pool({
    connectionString: config.adminUrl,
  });
  const reader = new Pool({
    connectionString: config.publicUrl,
  });
  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const apiBase = `${await app.getUrl()}/api/public/cards`;
  const slug = `test-${randomUUID()}`;
  const demoPath = path.resolve(__dirname, './fixtures/card.json');
  const demoContent = fs.readFileSync(demoPath, 'utf8');
  const data = JSON.parse(demoContent);

  data.mobile = {
    value: 'SECRET-MOBILE',
    enabled: false,
  };
  data.messengers.max = {
    value: 'https://example.com/SECRET-MAX',
    enabled: true,
  };
  data.blocks.messengers = false;
  data.blocks.address = false;
  data.address.value = 'SECRET-ADDRESS';
  data.adminNote = 'SECRET-ADMIN';
  const draft = {
    ...data,
    firstName: 'SECRET-DRAFT-NAME',
  };

  let userId;
  try {
    const user = await admin.query(
      'INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id',
      [`public-${slug}@example.test`, 'unused-test-hash'],
    );
    userId = user.rows[0].id;
    await admin.query(
      `INSERT INTO cards(slug,status,draft,published_snapshot,published_at,owner_user_id)
       VALUES ($1,'published',$2,$3,now(),$6),
              ($4,'draft',$2,NULL,NULL,$6),
              ($5,'draft',$2,$3,now(),$6)`,
      [
        slug,
        JSON.stringify(draft),
        JSON.stringify(data),
        `${slug}-draft`,
        `${slug}-unpublished`,
        userId,
      ],
    );

    await t.test('ответ фильтруется на сервере и содержит опубликованное имя', async () => {
      const response = await fetch(`${apiBase}/${slug}`);
      assert.equal(response.status, 200);
      const responseText = await response.text();
      const card = JSON.parse(responseText);

      assert.equal(card.slug, slug);
      assert.equal(card.displayName, [data.lastName, data.firstName, data.middleName].filter(Boolean).join(' '));
      assert.equal(card.mobile.value, '');
      assert.equal(card.messengers.max.value, '');
      assert.equal(card.address.value, '');
      assert.equal(card.blocks.map, false);
      assert.ok(!responseText.includes('SECRET-'));
      assert.ok(!('draft' in card));
      assert.ok(!('adminNote' in card));
    });

    await t.test('редактирование черновика не меняет опубликованный снимок', async () => {
      await admin.query(
        `UPDATE cards SET draft = jsonb_set(draft, '{firstName}', '"NEW-DRAFT"') WHERE slug=$1`,
        [slug],
      );

      const response = await fetch(`${apiBase}/${slug}`);
      const card = await response.json();

      assert.equal(card.displayName, [data.lastName, data.firstName, data.middleName].filter(Boolean).join(' '));
    });

    await t.test('черновик, снятая визитка, неизвестный slug и SQL-инъекция дают 404', async () => {
      const unavailableSlugs = [
        `${slug}-draft`,
        `${slug}-unpublished`,
        'missing-' + slug,
        encodeURIComponent("' OR 1=1 --"),
      ];

      for (const unavailableSlug of unavailableSlugs) {
        const response = await fetch(`${apiBase}/${unavailableSlug}`);

        assert.equal(response.status, 404);
      }
    });

    await t.test('публичных POST/PUT/PATCH/DELETE методов нет', async () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const response = await fetch(`${apiBase}/${slug}`, { method });

        assert.equal(response.status, 404);
      }
    });

    await t.test('снятие публикации сразу закрывает доступ', async () => {
      await admin.query(`UPDATE cards SET status='draft' WHERE slug=$1`, [slug]);
      const response = await fetch(`${apiBase}/${slug}`);

      assert.equal(response.status, 404);
    });

    await t.test('роль API не может читать черновики или изменять таблицу', async () => {
      await assert.rejects(
        reader.query('SELECT draft FROM cards'),
        error => error.code === '42501',
      );

      await assert.rejects(
        reader.query('DELETE FROM cards WHERE slug=$1', [slug]),
        error => ['25006', '42501'].includes(error.code),
      );
    });
  } finally {
    const createdSlugs = [slug, `${slug}-draft`, `${slug}-unpublished`];

    await admin.query('DELETE FROM cards WHERE slug = ANY($1::text[])', [createdSlugs]);
    if (userId) {
      await admin.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await app.close();
    await admin.end();
    await reader.end();
  }
});
