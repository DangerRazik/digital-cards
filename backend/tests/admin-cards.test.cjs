require('reflect-metadata');
const test = require('node:test');
const { makeDraft } = require('./fixtures/draft.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');

const configPath = path.resolve(__dirname, '../../.local/db-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
process.env.DATABASE_URL = config.publicUrl;
process.env.AUTH_DATABASE_URL = config.authUrl;
process.env.EDITOR_DATABASE_URL = config.editorUrl;
process.env.ADMIN_ORIGIN = 'http://127.0.0.1:4201';
process.env.PUBLIC_CARD_ORIGIN = 'http://127.0.0.1:4200';

test('Собственные визитки и создание черновиков', async t => {
  const owner = new Pool({ connectionString: config.adminUrl });
  const editor = new Pool({ connectionString: config.editorUrl });
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api`;
  const suffix = randomUUID();
  const firstEmail = `cards-a-${suffix}@example.test`;
  const secondEmail = `cards-b-${suffix}@example.test`;
  const userIds = [];
  let firstCookie;
  let secondCookie;
  let created;

  const input = {
    draft: makeDraft({
      firstName: ' Иван ',
      lastName: ' Иванов ',
      middleName: 'Иванович',
      jobTitle: { value: 'Разработчик', enabled: true },
      organization: { value: 'Пример', enabled: true },
    }),
  };

  async function post(route, body, cookie = '') {
    return fetch(`${base}/${route}`, {
      method: 'POST',
      headers: {
        Origin: process.env.ADMIN_ORIGIN,
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
  }

  async function register(email) {
    const response = await post('admin/auth/register', {
      email,
      password: 'Тест1234',
    });
    assert.equal(response.status, 201);
    const user = await response.json();
    userIds.push(user.id);

    return response.headers.get('set-cookie').split(';')[0];
  }

  async function list(cookie, query = '') {
    const response = await fetch(`${base}/admin/cards${query}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    return response.json();
  }

  try {
    await t.test('без входа список и создание недоступны', async () => {
      const response = await fetch(`${base}/admin/cards`);
      assert.equal(response.status, 401);
      const create = await post('admin/cards', input);
      assert.equal(create.status, 401);
    });

    firstCookie = await register(firstEmail);
    secondCookie = await register(secondEmail);

    await t.test('новые пользователи не видят демонстрационные визитки', async () => {
      assert.deepEqual(await list(firstCookie), []);
      assert.deepEqual(await list(secondCookie), []);
    });

    await t.test('создание сохраняет владельца сессии, поля и статус draft', async () => {
      const response = await post('admin/cards', input, firstCookie);
      assert.equal(response.status, 201);
      created = await response.json();
      assert.equal(created.displayName, 'Иванов Иван Иванович');
      assert.equal(created.jobTitle, input.draft.jobTitle.value);
      assert.equal(created.organization, input.draft.organization.value);
      assert.equal(created.status, 'draft');
      assert.match(created.slug, /^ivanov-ivan(-[1-9][0-9]*)?$/);
      assert.equal(created.hasUnpublishedChanges, false);
      assert.equal(created.publicUrl, `${process.env.PUBLIC_CARD_ORIGIN}/${created.slug}`);
      assert.ok(Number.isFinite(Date.parse(created.updatedAt)));
      assert.deepEqual(Object.keys(created).sort(), [
        'displayName', 'hasUnpublishedChanges', 'id', 'jobTitle', 'organization', 'publicUrl', 'slug', 'status', 'updatedAt',
      ]);

      const result = await owner.query('SELECT * FROM cards WHERE id = $1', [created.id]);
      const row = result.rows[0];
      assert.equal(row.owner_user_id, userIds[0]);
      assert.equal(row.draft.firstName, 'Иван');
      assert.equal(row.published_snapshot, null);
      assert.equal(row.published_at, null);
      assert.equal(row.draft.email.enabled, false);
    });

    await t.test('владелец видит визитку, другой пользователь не видит даже с подменой query', async () => {
      assert.deepEqual(await list(firstCookie), [created]);
      assert.deepEqual(await list(secondCookie, `?owner_user_id=${userIds[0]}`), []);
      const publicResponse = await fetch(`${base}/public/cards/${created.slug}`);
      assert.equal(publicResponse.status, 404);
    });

    await t.test('нельзя назначить владельца, статус или опубликованные данные через POST', async () => {
      const forbiddenFields = [
        { owner_user_id: userIds[0] },
        { status: 'published' },
        { published_snapshot: { displayName: 'Подмена' } },
      ];

      for (const fields of forbiddenFields) {
        const response = await post('admin/cards', {
          ...input,
          ...fields,
        }, secondCookie);
        assert.equal(response.status, 400);
      }
    });

    await t.test('валидация не допускает пустое имя, неправильные типы и адреса', async () => {
      const invalidFields = [
        { firstName: '   ' },
        { lastName: [] },
        { organization: { value: 'x'.repeat(201), enabled: true } },
        { slug: 'manual-address' },
        { displayName: 'Другое имя' },
      ];

      for (const fields of invalidFields) {
        const response = await post('admin/cards', {
          draft: { ...input.draft, ...fields },
        }, firstCookie);
        assert.equal(response.status, 400);
      }
    });

    await t.test('адрес создаётся автоматически, ФИО собирается из частей', async () => {
      const response = await post('admin/cards', {
        draft: makeDraft({ firstName: 'Анна', lastName: 'Петрова' }),
      }, secondCookie);
      assert.equal(response.status, 201);
      const card = await response.json();
      assert.match(card.slug, /^petrova-anna(-[1-9][0-9]*)?$/);
      assert.notEqual(card.slug, created.slug);
      assert.equal(card.displayName, 'Петрова Анна');
      assert.deepEqual(await list(secondCookie), [card]);
      assert.deepEqual(await list(firstCookie), [created]);
    });

    await t.test('запрос с постороннего сайта отклоняется', async () => {
      const response = await fetch(`${base}/admin/cards`, {
        method: 'POST',
        headers: {
          Origin: 'https://foreign.example',
          'Content-Type': 'application/json',
          Cookie: firstCookie,
        },
        body: JSON.stringify(input),
      });
      assert.equal(response.status, 403);
    });

    await t.test('роль создания не может публиковать, удалять визитки или читать пароли', async () => {
      await assert.rejects(editor.query('SELECT * FROM users'), { code: '42501' });
      await assert.rejects(editor.query("UPDATE cards SET status = 'published' WHERE false"), { code: '42501' });
      await assert.rejects(editor.query('DELETE FROM cards WHERE false'), { code: '42501' });
      await assert.rejects(editor.query(
        "INSERT INTO cards(slug, draft, status) VALUES ($1, '{}', 'draft')",
        [`forbidden-${suffix}`],
      ), { code: '42501' });
    });

    await t.test('после выхода даже прежняя cookie не даёт доступ к списку', async () => {
      const logout = await post('admin/auth/logout', {}, firstCookie);
      assert.equal(logout.status, 204);
      const response = await fetch(`${base}/admin/cards`, {
        headers: { Cookie: firstCookie },
      });
      assert.equal(response.status, 401);
    });
  } finally {
    await app.close();
    await owner.query('DELETE FROM cards WHERE owner_user_id = ANY($1::uuid[])', [userIds]);
    await owner.query('DELETE FROM users WHERE email = ANY($1::text[])', [[firstEmail, secondEmail]]);
    await owner.end();
    await editor.end();
  }
});
