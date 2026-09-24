require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');

const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../.local/db-config.json'), 'utf8'));
process.env.DATABASE_URL = config.publicUrl;
process.env.AUTH_DATABASE_URL = config.authUrl;
process.env.ADMIN_ORIGIN = 'http://127.0.0.1:4201';

async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');

  return app;
}

function getCookie(response) {
  const header = response.headers.get('set-cookie');
  assert.ok(header.includes('HttpOnly'));
  assert.ok(header.includes('SameSite=Strict'));
  assert.ok(header.includes('Path=/api/admin'));

  return header.split(';')[0];
}

test('Регистрация и серверные сессии', async t => {
  const owner = new Pool({ connectionString: config.adminUrl });
  const reader = new Pool({ connectionString: config.publicUrl });
  const authDatabase = new Pool({ connectionString: config.authUrl });
  let app = await createApp();
  let base = `${await app.getUrl()}/api/admin/auth`;
  const email = `auth-${randomUUID()}@example.test`;
  const secondEmail = `auth-${randomUUID()}@example.test`;
  const password = 'Тест1234';
  let cookie;
  let userId;

  async function post(route, body, sessionCookie = '') {
    return fetch(`${base}/${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: process.env.ADMIN_ORIGIN,
        Cookie: sessionCookie,
      },
      body: JSON.stringify(body),
    });
  }

  try {
    await t.test('без сессии сервер не отдаёт личный кабинет', async () => {
      const response = await fetch(`${base}/me`);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    });

    await t.test('проверяются origin, JSON и входные данные', async () => {
      const foreign = await fetch(`${base}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(foreign.status, 403);

      const missingOrigin = await fetch(`${base}/register`, { method: 'POST' });
      assert.equal(missingOrigin.status, 403);

      const form = await fetch(`${base}/register`, {
        method: 'POST',
        headers: { Origin: process.env.ADMIN_ORIGIN },
        body: 'email=test',
      });
      assert.equal(form.status, 415);

      const invalidBodies = [
        {
          email,
          password: 'Тест123',
        },
        {
          email,
          password: 'a'.repeat(129),
        },
        {
          email: 'invalid',
          password,
        },
        [],
        {
          email: {},
          password,
        },
      ];

      for (const body of invalidBodies) {
        const response = await post('register', body);
        assert.equal(response.status, 400);
      }
    });

    await t.test('регистрация принимает пароль из 8 символов, нормализует email и создаёт сессию', async () => {
      const response = await post('register', { email: ` ${email.toUpperCase()} `, password, role: 'admin' });
      assert.equal(response.status, 201);
      cookie = getCookie(response);
      const user = await response.json();
      assert.deepEqual(Object.keys(user).sort(), ['email', 'id']);
      assert.equal(user.email, email);
      userId = user.id;

      const stored = await owner.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      assert.match(stored.rows[0].password_hash, /^scrypt-v1:/);
      assert.ok(!stored.rows[0].password_hash.includes(password));
      const token = cookie.split('=')[1];
      const sessions = await owner.query('SELECT token_hash FROM sessions WHERE user_id = $1', [userId]);
      assert.equal(sessions.rows[0].token_hash, createHash('sha256').update(token).digest('hex'));
      assert.notEqual(sessions.rows[0].token_hash, token);
    });

    await t.test('повторная регистрация не создаёт второй аккаунт', async () => {
      const response = await post('register', { email, password });
      assert.equal(response.status, 409);
    });

    await t.test('сессия переживает перезапуск приложения', async () => {
      await app.close();
      app = await createApp();
      base = `${await app.getUrl()}/api/admin/auth`;
      const response = await fetch(`${base}/me`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { id: userId, email });
    });

    await t.test('неверный пароль и неизвестный email дают одинаковую ошибку', async () => {
      const wrong = await post('login', { email, password: 'incorrect password' });
      const unknown = await post('login', { email: secondEmail, password });
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.deepEqual(await wrong.json(), await unknown.json());
    });

    await t.test('вход заменяет прежний токен; пользователи различаются', async () => {
      const oldCookie = cookie;
      const response = await post('login', { email, password }, oldCookie);
      assert.equal(response.status, 200);
      cookie = getCookie(response);
      assert.notEqual(cookie, oldCookie);
      const oldSession = await fetch(`${base}/me`, { headers: { Cookie: oldCookie } });
      assert.equal(oldSession.status, 401);

      const second = await post('register', { email: secondEmail, password });
      assert.equal(second.status, 201);
      const secondCookie = getCookie(second);
      const current = await fetch(`${base}/me`, { headers: { Cookie: secondCookie } });
      const secondUser = await current.json();
      assert.equal(secondUser.email, secondEmail);
      assert.notEqual(secondUser.id, userId);
    });

    await t.test('выход удаляет сессию на сервере, истёкший и поддельный токены отклоняются', async () => {
      const response = await post('logout', {}, cookie);
      assert.equal(response.status, 204);
      assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'));
      const loggedOut = await fetch(`${base}/me`, { headers: { Cookie: cookie } });
      assert.equal(loggedOut.status, 401);

      const login = await post('login', { email, password });
      cookie = getCookie(login);
      await owner.query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1", [userId]);
      for (const value of [cookie, 'cards_session=invalid', `cards_session=${'f'.repeat(64)}`]) {
        const expired = await fetch(`${base}/me`, { headers: { Cookie: value } });
        assert.equal(expired.status, 401);
      }
    });

    await t.test('права БД разделены: публичная роль не читает аккаунты; auth не пишет визитки', async () => {
      await assert.rejects(reader.query('SELECT * FROM users'), { code: '42501' });
      await assert.rejects(reader.query('SELECT * FROM sessions'), { code: '42501' });
      await assert.rejects(authDatabase.query('SELECT * FROM cards'), { code: '42501' });
      await assert.rejects(authDatabase.query("UPDATE cards SET status = 'draft' WHERE false"), { code: '42501' });
    });

    await t.test('production cookie имеет Secure и не задаёт Domain', () => {
      const { writeSessionCookie } = require('../dist/auth/session-cookie');
      const previousEnvironment = process.env.NODE_ENV;
      let cookieHeader;

      try {
        process.env.NODE_ENV = 'production';
        writeSessionCookie({ setHeader: (name, value) => { cookieHeader = value; } }, 'test', 60);
        assert.ok(cookieHeader.includes('; Secure'));
        assert.ok(!cookieHeader.includes('Domain='));
      } finally {
        if (previousEnvironment === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = previousEnvironment;
        }
      }
    });

    await t.test('ограничение попыток возвращает 429, выход остаётся доступным', async () => {
      let status;
      for (let attempt = 0; attempt < 21; attempt += 1) {
        const response = await post('login', {});
        status = response.status;
        if (status === 429) {
          assert.ok(response.headers.get('retry-after'));
          break;
        }
      }
      assert.equal(status, 429);
      const logout = await post('logout', {});
      assert.equal(logout.status, 204);
    });
  } finally {
    await app.close();
    await owner.query('DELETE FROM users WHERE email = ANY($1::text[])', [[email, secondEmail]]);
    await owner.end();
    await reader.end();
    await authDatabase.end();
  }
});
