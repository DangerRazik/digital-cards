import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_CARD } from './fixtures/demo-card';
import { createVCard } from '../src/app/vcard';
import { visible, webUrl } from '../src/app/card.model';

test('vCard содержит структурированное имя и оба типа телефона', () => {
  const text = createVCard(DEMO_CARD).replace(/\r\n /g, '');
  assert.ok(text.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
  assert.ok(text.includes('N:Тестов;Иван;;;\r\n'));
  assert.ok(text.includes('FN:Тестов Иван\r\n'));
  assert.ok(text.includes('TEL;TYPE=CELL:+7 (900) 000-00-00'));
  assert.ok(text.includes('TEL;TYPE=WORK,VOICE:+7 (495) 000-00-00'));
  assert.ok(text.includes('ORG:Тестовая организация'));
  assert.ok(text.includes('TITLE:Руководитель службы информационных технологий'));
  assert.ok(text.includes('EMAIL;TYPE=INTERNET:name@example.ru'));
  assert.ok(text.includes('URL:https://example.com/'));
  assert.ok(text.endsWith('END:VCARD\r\n'));
});

test('отключённые поля и блоки не экспортируются', () => {
  const card = structuredClone(DEMO_CARD);
  card.mobile.enabled = false;
  card.email.enabled = false;
  card.blocks.website = false;

  let text = createVCard(card);

  assert.ok(!text.includes('TYPE=CELL'));
  assert.ok(!text.includes('EMAIL'));
  assert.ok(!text.includes('URL:'));

  card.blocks.phones = false;
  text = createVCard(card);
  assert.ok(!text.includes('TEL;'));
});

test('Unicode переносится по 75 байт без повреждения символов', () => {
  const card = structuredClone(DEMO_CARD);
  card.displayName = 'Очень длинное имя сотрудника '.repeat(10);
  const text = createVCard(card);

  for (const line of text.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  }

  assert.ok(text.replace(/\r\n /g, '').includes(`FN:${card.displayName}\r\n`));
  assert.ok(!text.includes('�'));
});

test('спецсимволы и переносы не создают новые свойства vCard', () => {
  const card = structuredClone(DEMO_CARD);
  card.displayName = 'Имя; Фамилия, \\ Команда\r\nTEL:999';
  const text = createVCard(card).replace(/\r\n /g, '');
  assert.ok(text.includes('FN:Имя\\; Фамилия\\, \\\\ Команда\\nTEL:999'));
  assert.ok(!text.includes('\r\nTEL:999'));
});

test('пустые поля скрываются, опасные внешние URL отклоняются', () => {
  const emptyField = {
    value: '  ',
    enabled: true,
  };
  const disabledField = {
    value: 'Есть значение',
    enabled: false,
  };

  assert.equal(visible(emptyField), false);
  assert.equal(visible(disabledField), false);

  const unsafeUrls = [
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///tmp/a',
    'https://u:p@example.com',
    'не ссылка',
  ];

  for (const url of unsafeUrls) {
    assert.equal(webUrl(url), null);
  }
  assert.equal(webUrl('https://example.ru/path'), 'https://example.ru/path');
  const card = structuredClone(DEMO_CARD);
  card.website.value = 'javascript:alert(1)';
  assert.ok(!createVCard(card).includes('URL:'));
});
