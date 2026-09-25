const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSiteOrigins } = require('../src/site-origins.ts');
const { writeSessionCookie } = require('../src/auth/session-cookie.ts');

const internal = {
  NODE_ENV: 'production',
  INTERNAL_HTTP: 'true',
  ADMIN_ORIGIN: 'http://10.3.237.134:8081',
  PUBLIC_CARD_ORIGIN: 'http://10.3.237.134:8082',
};

test('HTTP разрешён явно для внутреннего IP, обычный production требует HTTPS', () => {
  assert.doesNotThrow(() => validateSiteOrigins(internal));
  assert.throws(() => validateSiteOrigins({ ...internal, INTERNAL_HTTP: 'false' }));
  assert.throws(() => validateSiteOrigins({ ...internal, INTERNAL_HTTP: undefined }));
  assert.doesNotThrow(() => validateSiteOrigins({
    NODE_ENV: 'production',
    ADMIN_ORIGIN: 'https://admin.example.test',
    PUBLIC_CARD_ORIGIN: 'https://card.example.test',
  }));
});

test('Тестовый режим не принимает публичные IP, домены и неправильные origin', () => {
  for (const address of [
    'http://8.8.8.8:8081',
    'http://example.test:8081',
    'http://10.3.237.134:8081/',
    'http://user:pass@10.3.237.134:8081',
    'ftp://10.3.237.134:8081',
    internal.PUBLIC_CARD_ORIGIN,
  ]) {
    assert.throws(() => validateSiteOrigins({ ...internal, ADMIN_ORIGIN: address }));
  }
});

test('Cookie работает по внутреннему HTTP; HttpOnly, SameSite и путь сохранены', () => {
  const previous = { ...process.env };
  let cookie;
  const response = { setHeader(name, value) { cookie = value; } };
  try {
    Object.assign(process.env, internal);
    writeSessionCookie(response, 'a'.repeat(64), 3600);
    assert.ok(!cookie.includes('; Secure'));
    assert.ok(cookie.includes('; HttpOnly'));
    assert.ok(cookie.includes('; SameSite=Strict'));
    assert.ok(cookie.includes('; Path=/api/admin'));

    process.env.INTERNAL_HTTP = 'false';
    writeSessionCookie(response, 'a'.repeat(64), 3600);
    assert.ok(cookie.includes('; Secure'));

    process.env.INTERNAL_HTTP = 'true';
    process.env.ADMIN_ORIGIN = 'https://admin.example.test';
    writeSessionCookie(response, 'a'.repeat(64), 0);
    assert.ok(cookie.includes('; Secure'));
    assert.ok(cookie.includes('Max-Age=0'));
  } finally {
    for (const key of Object.keys(internal)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
});
