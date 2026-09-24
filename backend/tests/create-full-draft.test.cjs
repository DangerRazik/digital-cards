const test = require('node:test');
const assert = require('node:assert/strict');
const { readNewCard } = require('../dist/admin-cards/create-card.input');
const { makeDraft } = require('./fixtures/draft.cjs');
const { toPublicCard } = require('../dist/public-card');

function fullDraft() {
  const draft = makeDraft();
  draft.mobile = { value: '+79990000000', enabled: true };
  draft.email = { value: 'private@example.test', enabled: false };
  draft.photo = { value: '/assets/avatar.jpg', enabled: true };
  return draft;
}

test('Полная форма сохраняет контакты и получает автоматический адрес', () => {
  const created = readNewCard({ draft: fullDraft() });
  assert.equal(created.slug, 'ivanov-ivan');
  assert.ok(!('displayName' in created.draft));
  assert.ok(!('logo' in created.draft));
  assert.equal(created.draft.mobile.value, '+79990000000');
  assert.equal(created.draft.photo.value, '/assets/avatar.jpg');
  assert.equal(created.draft.email.enabled, false);
  const preview = toPublicCard('preview', created.draft);
  assert.equal(preview.displayName, 'Иванов Иван');
  assert.equal(preview.email.value, '');
});

test('Полная форма не обходит проверку полей, ссылок и обязательного имени', () => {
  assert.throws(() => readNewCard({ draft: fullDraft(), owner_user_id: 'other' }));
  const draft = fullDraft();
  draft.firstName = '';
  assert.throws(() => readNewCard({ draft }));
  draft.firstName = 'Иван';
  draft.website = { value: 'javascript:alert(1)', enabled: false };
  assert.throws(() => readNewCard({ draft }));
});

test('Старый формат и удалённые поля больше не принимаются', () => {
  assert.throws(() => readNewCard({ firstName: 'Иван', lastName: 'Иванов' }));
  const draft = fullDraft();
  draft.logo = { value: '', enabled: false };
  assert.throws(() => readNewCard({ draft }));
});
