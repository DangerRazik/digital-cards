require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { AdminCardsService } = require('../dist/admin-cards/admin-cards.service');
const { makeDraft } = require('./fixtures/draft.cjs');

test('Свободный адрес остаётся без индекса, совпадения получают последовательные номера', async () => {
  const service = new AdminCardsService({ checkDraftImages: async () => {} });
  const occupied = new Set();
  const attempted = [];

  // Подменяем только ответ БД: проверяем подбор адреса без запуска приложения.
  service.pool.query = async (sql, values) => {
    assert.ok(sql.includes('ON CONFLICT (slug) DO NOTHING'));
    const [slug] = values;
    attempted.push(slug);

    if (occupied.has(slug)) {
      return { rows: [] };
    }

    occupied.add(slug);
    return {
      rows: [{ slug, updated_at: new Date(), status: 'draft' }],
    };
  };

  try {
    for (let index = 0; index < 12; index += 1) {
      const card = await service.create('test-owner', { draft: makeDraft() });
      let expected = 'ivanov-ivan';

      if (index > 0) {
        expected = `ivanov-ivan-${index}`;
      }

      assert.equal(card.slug, expected);
    }

    assert.deepEqual(attempted.slice(0, 6), [
      'ivanov-ivan',
      'ivanov-ivan',
      'ivanov-ivan-1',
      'ivanov-ivan',
      'ivanov-ivan-1',
      'ivanov-ivan-2',
    ]);
  } finally {
    await service.onModuleDestroy();
  }
});
