require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { makeDraft } = require('./fixtures/draft.cjs');
const { readDraftInput } = require('../dist/admin-cards/card-draft.input');

const configPath = path.resolve(__dirname, '../../.local/db-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
process.env.DATABASE_URL = config.publicUrl;
process.env.AUTH_DATABASE_URL = config.authUrl;
process.env.EDITOR_DATABASE_URL = config.editorUrl;
process.env.ADMIN_ORIGIN = 'http://127.0.0.1:4201';
process.env.PUBLIC_CARD_ORIGIN = 'http://127.0.0.1:4200';

test('Валидация ссылок и переключателей черновика', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '//example.test', 'https://user:password@example.test']) {
    const draft = makeDraft();
    draft.website.value = value;
    assert.throws(() => readDraftInput(draft), error => error.getStatus() === 400);
    draft.website.value = '';
    draft.photo.value = value;
    assert.throws(() => readDraftInput(draft), error => error.getStatus() === 400);
  }

  const valid = makeDraft();
  valid.photo.value = '/assets/photo.jpg';
  valid.website.value = 'https://example.test';
  valid.email.value = 'person@example.test';
  valid.mobile.value = '+7 900 000-00-00';
  valid.mobile.enabled = false;
  const parsed = readDraftInput(valid);
  assert.equal(parsed.mobile.value, valid.mobile.value);
  assert.equal(parsed.mobile.enabled, false);
  assert.equal(parsed.firstName, 'Иван');
  assert.ok(!('displayName' in parsed));

  valid.blocks.phones = 'false';
  assert.throws(() => readDraftInput(valid), error => error.getStatus() === 400);
  valid.blocks.phones = false;
  valid.email.value = 'invalid-email';
  assert.throws(() => readDraftInput(valid), error => error.getStatus() === 400);
  valid.email.value = '';
  valid.messengers.max.enabled = 1;
  assert.throws(() => readDraftInput(valid), error => error.getStatus() === 400);
  valid.messengers.max.enabled = false;
  valid.organization.value = 'x'.repeat(201);
  assert.throws(() => readDraftInput(valid), error => error.getStatus() === 400);

  for (const forbidden of ['slug', 'displayName', 'owner_user_id', 'status', 'published_snapshot']) {
    const draft = makeDraft();
    draft[forbidden] = 'not allowed';
    assert.throws(() => readDraftInput(draft), error => error.getStatus() === 400);
  }
});

test('Загрузка и сохранение только собственного черновика', async t => {
  const owner = new Pool({ connectionString: config.adminUrl });
  const editor = new Pool({ connectionString: config.editorUrl });
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api`;
  const suffix = randomUUID();
  const emails = [`edit-a-${suffix}@example.test`, `edit-b-${suffix}@example.test`];
  const userIds = [];
  let card;
  let draft;

  async function request(method, route, cookie = '', body) {
    return fetch(`${base}/${route}`, {
      method,
      headers: {
        Origin: process.env.ADMIN_ORIGIN,
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function register(email) {
    const response = await request('POST', 'admin/auth/register', '', {
      email,
      password: 'Тест1234',
    });
    assert.equal(response.status, 201);
    const user = await response.json();
    userIds.push(user.id);
    return response.headers.get('set-cookie').split(';')[0];
  }

  try {
    const firstCookie = await register(emails[0]);
    const secondCookie = await register(emails[1]);
    const created = await request('POST', 'admin/cards', firstCookie, { draft: makeDraft() });
    assert.equal(created.status, 201);
    card = await created.json();
    const route = `admin/cards/${card.id}/draft`;

    await t.test('владелец загружает данные редактора без отдельного displayName', async () => {
      const response = await request('GET', route, firstCookie);
      assert.equal(response.status, 200);
      const detail = await response.json();
      draft = detail.draft;
      assert.equal(draft.firstName, 'Иван');
      assert.ok(!('displayName' in draft));
      assert.ok(!('slug' in draft));
    });

    await t.test('чужой и несуществующий черновики дают одинаковый 404', async () => {
      const foreign = await request('GET', route, secondCookie);
      const missing = await request('GET', `admin/cards/${randomUUID()}/draft`, secondCookie);
      assert.equal(foreign.status, 404);
      assert.equal(missing.status, 404);
      assert.deepEqual(await foreign.json(), await missing.json());
      const update = await request('PUT', route, secondCookie, draft);
      assert.equal(update.status, 404);
      const invalidId = await request('GET', 'admin/cards/not-a-uuid/draft', firstCookie);
      assert.equal(invalidId.status, 404);
    });

    await t.test('без сессии нельзя загрузить или сохранить черновик', async () => {
      const read = await request('GET', route);
      const save = await request('PUT', route, '', draft);
      assert.equal(read.status, 401);
      assert.equal(save.status, 401);
    });

    await t.test('сохранение обновляет ФИО и контакты, но сохраняет постоянный URL', async () => {
      draft.firstName = 'Пётр';
      draft.mobile = {
        value: '+7 900 000-00-00',
        enabled: false,
      };
      draft.messengers.telegram = {
        value: 'https://t.me/example',
        enabled: true,
      };
      draft.blocks.phones = false;
      const response = await request('PUT', route, firstCookie, draft);
      assert.equal(response.status, 200);
      const updated = await response.json();
      assert.equal(updated.slug, card.slug);
      assert.equal(updated.publicUrl, card.publicUrl);
      assert.equal(updated.displayName, 'Иванов Пётр');
      assert.equal(updated.status, 'draft');
      assert.deepEqual(updated.draft, draft);
      const reopened = await request('GET', route, firstCookie);
      assert.deepEqual((await reopened.json()).draft, draft);
      const publicResponse = await fetch(`${base}/public/cards/${card.slug}`);
      assert.equal(publicResponse.status, 404);
    });

    await t.test('опубликованный снимок не меняется при редактировании', async () => {
      const current = await owner.query('SELECT draft FROM cards WHERE id = $1', [card.id]);
      const snapshot = current.rows[0].draft;
      await owner.query(
        "UPDATE cards SET status = 'published', published_snapshot = $1, published_at = now() WHERE id = $2",
        [JSON.stringify(snapshot), card.id],
      );
      draft.lastName = 'Новиков';
      const response = await request('PUT', route, firstCookie, draft);
      assert.equal(response.status, 200);
      const result = await owner.query('SELECT published_snapshot, owner_user_id, slug FROM cards WHERE id = $1', [card.id]);
      assert.deepEqual(result.rows[0].published_snapshot, snapshot);
      assert.equal(result.rows[0].owner_user_id, userIds[0]);
      assert.equal(result.rows[0].slug, card.slug);
      const publicResponse = await fetch(`${base}/public/cards/${card.slug}`);
      const publicCard = await publicResponse.json();
      assert.equal(publicCard.displayName, 'Иванов Пётр');
      assert.equal(publicCard.mobile.value, '');
    });

    await t.test('нельзя менять адрес, владельца, статус или отдельное ФИО', async () => {
      for (const key of ['slug', 'owner_user_id', 'status', 'displayName', 'published_snapshot']) {
        const response = await request('PUT', route, firstCookie, {
          ...draft,
          [key]: 'forbidden',
        });
        assert.equal(response.status, 400);
      }
    });

    await t.test('предпросмотр показывает текущую форму, фильтрует скрытые поля и ничего не сохраняет', async () => {
      const before = await owner.query('SELECT * FROM cards WHERE id = $1', [card.id]);
      const previewDraft = structuredClone(draft);
      previewDraft.firstName = 'Предпросмотр';
      previewDraft.mobile = {
        value: 'HIDDEN-MOBILE',
        enabled: false,
      };
      previewDraft.messengers.telegram = {
        value: 'https://t.me/HIDDEN-TELEGRAM',
        enabled: true,
      };
      previewDraft.blocks.messengers = false;
      previewDraft.blocks.address = false;
      previewDraft.address.value = 'HIDDEN-ADDRESS';
      const response = await request('POST', `admin/cards/${card.id}/preview`, firstCookie, previewDraft);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const text = await response.text();
      const preview = JSON.parse(text);
      assert.equal(preview.displayName, 'Новиков Предпросмотр');
      assert.equal(preview.slug, card.slug);
      assert.equal(preview.blocks.map, false);
      assert.ok(!text.includes('HIDDEN-'));
      assert.ok(!('owner_user_id' in preview));
      assert.ok(!('draft' in preview));
      const after = await owner.query('SELECT * FROM cards WHERE id = $1', [card.id]);
      assert.deepEqual(after.rows, before.rows);
    });

    await t.test('предпросмотр требует сессию владельца', async () => {
      const previewRoute = `admin/cards/${card.id}/preview`;
      const anonymous = await request('POST', previewRoute, '', draft);
      assert.equal(anonymous.status, 401);
      const foreign = await request('POST', previewRoute, secondCookie, draft);
      assert.equal(foreign.status, 404);
      const missing = await request('POST', `admin/cards/${randomUUID()}/preview`, firstCookie, draft);
      assert.equal(missing.status, 404);
    });

    await t.test('права SQL ограничены черновиком и датой изменения', async () => {
      for (const column of ['slug', 'owner_user_id', 'status', 'published_snapshot']) {
        await assert.rejects(
          editor.query(`UPDATE cards SET ${column} = ${column} WHERE false`),
          { code: '42501' },
        );
      }
      await editor.query('UPDATE cards SET draft = draft, updated_at = updated_at WHERE false');
    });
  } finally {
    await app.close();
    await owner.query('DELETE FROM cards WHERE owner_user_id = ANY($1::uuid[])', [userIds]);
    await owner.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
    await owner.end();
    await editor.end();
  }
});
