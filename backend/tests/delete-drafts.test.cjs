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

test('Удаление только собственного неопубликованного черновика', async t => {
  const owner = new Pool({ connectionString: config.adminUrl });
  const reader = new Pool({ connectionString: config.publicUrl });
  const editor = new Pool({ connectionString: config.editorUrl });
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api`;
  const suffix = randomUUID();
  const emails = [`delete-a-${suffix}@example.test`, `delete-b-${suffix}@example.test`];
  const userIds = [];

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
    const card = await created.json();
    const route = `admin/cards/${card.id}/draft`;

    await t.test('без входа удалить нельзя', async () => {
      const response = await request('DELETE', route);
      assert.equal(response.status, 401);
    });

    await t.test('чужая и отсутствующая запись дают одинаковый 404', async () => {
      const foreign = await request('DELETE', route, secondCookie);
      const missing = await request('DELETE', `admin/cards/${randomUUID()}/draft`, secondCookie);
      assert.equal(foreign.status, 404);
      assert.equal(missing.status, 404);
      assert.deepEqual(await foreign.json(), await missing.json());
      const existing = await request('GET', route, firstCookie);
      assert.equal(existing.status, 200);
    });

    await t.test('посторонний Origin не может выполнить удаление', async () => {
      const response = await fetch(`${base}/${route}`, {
        method: 'DELETE',
        headers: {
          Origin: 'https://foreign.example',
          'Content-Type': 'application/json',
          Cookie: firstCookie,
        },
      });
      assert.equal(response.status, 403);
    });

    await t.test('опубликованные записи нельзя удалить', async () => {
      await owner.query(
        "UPDATE cards SET status = 'published', published_snapshot = draft, published_at = now() WHERE id = $1",
        [card.id],
      );
      for (const status of ['published']) {
        await owner.query('UPDATE cards SET status = $1 WHERE id = $2', [status, card.id]);
        const response = await request('DELETE', route, firstCookie);
        assert.equal(response.status, 404);
        const remaining = await owner.query('SELECT id FROM cards WHERE id = $1', [card.id]);
        assert.equal(remaining.rowCount, 1);
      }
    });

    await t.test('роль редактора не имеет общего DELETE, публичная роль не вызывает функцию', async () => {
      await assert.rejects(editor.query('DELETE FROM cards WHERE false'), { code: '42501' });
      await assert.rejects(
        reader.query('SELECT public.delete_owned_draft($1, $2)', [card.id, userIds[0]]),
        { code: '42501' },
      );
      const mismatch = await editor.query(
        'SELECT public.delete_owned_draft($1, $2) AS deleted',
        [card.id, userIds[1]],
      );
      assert.equal(mismatch.rows[0].deleted, false);
    });

    await t.test('владелец удаляет неопубликованный черновик, повторный запрос получает 404', async () => {
      await owner.query(
        "UPDATE cards SET status = 'draft', published_snapshot = NULL, published_at = NULL WHERE id = $1",
        [card.id],
      );
      const response = await request('DELETE', route, firstCookie);
      assert.equal(response.status, 204);
      assert.equal(await response.text(), '');
      const read = await request('GET', route, firstCookie);
      assert.equal(read.status, 404);
      const repeated = await request('DELETE', route, firstCookie);
      assert.equal(repeated.status, 404);
      const remaining = await owner.query('SELECT id FROM cards WHERE id = $1', [card.id]);
      assert.equal(remaining.rowCount, 0);
      const list = await request('GET', 'admin/cards', firstCookie);
      assert.deepEqual(await list.json(), []);
    });
  } finally {
    await app.close();
    await owner.query('DELETE FROM cards WHERE owner_user_id = ANY($1::uuid[])', [userIds]);
    await owner.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
    await owner.end();
    await reader.end();
    await editor.end();
  }
});
