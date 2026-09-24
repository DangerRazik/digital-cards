const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

// Проверяем реальные права PostgreSQL без запуска приложения.
// Все тестовые записи откатываются вместе с транзакцией.
test('Публикация: владелец, отдельный снимок, снятие и постоянный адрес', async () => {
  const configPath = path.resolve(__dirname, '../../.local/db-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const client = new Client({ connectionString: config.adminUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    const userId = randomUUID();
    const cardId = randomUUID();
    const slug = `publication-test-${cardId}`;
    await client.query(
      'INSERT INTO users(id, email, password_hash) VALUES ($1, $2, $3)',
      [userId, `${userId}@example.test`, 'test-only'],
    );
    await client.query(
      'INSERT INTO cards(id, slug, owner_user_id, draft) VALUES ($1, $2, $3, $4)',
      [cardId, slug, userId, JSON.stringify({ firstName: 'First version' })],
    );
    await client.query('SET LOCAL ROLE cards_editor');

    for (const operation of ['publish_owned_card', 'unpublish_owned_card']) {
      const foreign = await client.query(`SELECT * FROM public.${operation}($1, $2)`, [cardId, randomUUID()]);
      assert.equal(foreign.rowCount, 0);
      const missing = await client.query(`SELECT * FROM public.${operation}($1, $2)`, [randomUUID(), userId]);
      assert.equal(missing.rowCount, 0);
    }

    const published = await client.query('SELECT * FROM public.publish_owned_card($1, $2)', [cardId, userId]);
    assert.equal(published.rows[0].status, 'published');
    assert.deepEqual(published.rows[0].published_snapshot, published.rows[0].draft);
    assert.ok(published.rows[0].published_at);

    async function hasUnpublishedChanges() {
      const result = await client.query(
        `SELECT (status = 'published' AND draft IS DISTINCT FROM published_snapshot) AS changed
         FROM cards WHERE id = $1`,
        [cardId],
      );
      return result.rows[0].changed;
    }

    assert.equal(await hasUnpublishedChanges(), false);

    await client.query('UPDATE cards SET draft = $1 WHERE id = $2', [{ firstName: 'Second version' }, cardId]);
    assert.equal(await hasUnpublishedChanges(), true);
    let snapshot = await client.query('SELECT published_snapshot FROM cards WHERE id = $1', [cardId]);
    assert.equal(snapshot.rows[0].published_snapshot.firstName, 'First version');
    const updated = await client.query('SELECT * FROM public.publish_owned_card($1, $2)', [cardId, userId]);
    assert.equal(updated.rows[0].published_snapshot.firstName, 'Second version');
    assert.equal(updated.rows[0].slug, slug);
    assert.equal(await hasUnpublishedChanges(), false);

    await client.query('RESET ROLE');
    let visible = await client.query('SELECT * FROM published_cards WHERE slug = $1', [slug]);
    assert.equal(visible.rowCount, 1);
    await client.query('SET LOCAL ROLE cards_editor');
    const unpublished = await client.query('SELECT * FROM public.unpublish_owned_card($1, $2)', [cardId, userId]);
    assert.equal(unpublished.rows[0].status, 'draft');
    assert.equal(unpublished.rows[0].draft.firstName, 'Second version');

    await client.query('RESET ROLE');
    visible = await client.query('SELECT * FROM published_cards WHERE slug = $1', [slug]);
    assert.equal(visible.rowCount, 0);
    await client.query('SET LOCAL ROLE cards_editor');
    const restored = await client.query('SELECT * FROM public.publish_owned_card($1, $2)', [cardId, userId]);
    assert.equal(restored.rows[0].slug, slug);
    assert.equal(restored.rows[0].status, 'published');
    await client.query('RESET ROLE');

    for (const operation of ['publish_owned_card', 'unpublish_owned_card']) {
      const permission = await client.query(
        'SELECT has_function_privilege($1, $2, $3) AS allowed',
        ['cards_public', `public.${operation}(uuid,uuid)`, 'EXECUTE'],
      );
      assert.equal(permission.rows[0].allowed, false);
    }
    await client.query('SET LOCAL ROLE cards_editor');
    let deleted = await client.query('SELECT public.delete_owned_draft($1, $2) AS deleted', [cardId, userId]);
    assert.equal(deleted.rows[0].deleted, false);
    await client.query('SELECT * FROM public.unpublish_owned_card($1, $2)', [cardId, userId]);
    deleted = await client.query('SELECT public.delete_owned_draft($1, $2) AS deleted', [cardId, randomUUID()]);
    assert.equal(deleted.rows[0].deleted, false);
    deleted = await client.query('SELECT public.delete_owned_draft($1, $2) AS deleted', [cardId, userId]);
    assert.equal(deleted.rows[0].deleted, true);
    await client.query('RESET ROLE');

    const broadUpdate = await client.query(
      "SELECT has_column_privilege('cards_editor', 'cards', 'status', 'UPDATE') AS allowed",
    );
    assert.equal(broadUpdate.rows[0].allowed, false);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
