const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const configPath = path.resolve(__dirname, '../../.local/db-config.json');
const configContent = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configContent);

// Учётная запись авторизации отделена от владельца БД и публичного читателя.
if (!config.authUrl) {
  const authUrl = new URL(config.adminUrl);
  authUrl.username = 'cards_auth';
  authUrl.password = randomBytes(32).toString('hex');
  config.authUrl = authUrl.href;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

if (!config.editorUrl) {
  const editorUrl = new URL(config.adminUrl);
  editorUrl.username = 'cards_editor';
  editorUrl.password = randomBytes(32).toString('hex');
  config.editorUrl = editorUrl.href;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function setup() {
  const pool = new Pool({
    connectionString: config.adminUrl,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'cards_auth'");

    if (role.rowCount === 0) {
      const password = new URL(config.authUrl).password;
      const statement = await client.query(
        "SELECT format('CREATE ROLE cards_auth LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', $1::text) AS sql",
        [password],
      );
      await client.query(statement.rows[0].sql);
    }

    const databaseName = new URL(config.adminUrl).pathname.slice(1);
    const permissions = await client.query(
      "SELECT format('GRANT CONNECT ON DATABASE %I TO cards_auth', $1::text) AS sql",
      [databaseName],
    );
    await client.query(permissions.rows[0].sql);
    await client.query('GRANT USAGE ON SCHEMA public TO cards_auth');

    const editorRole = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'cards_editor'");

    if (editorRole.rowCount === 0) {
      const password = new URL(config.editorUrl).password;
      const statement = await client.query(
        "SELECT format('CREATE ROLE cards_editor LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', $1::text) AS sql",
        [password],
      );
      await client.query(statement.rows[0].sql);
    }

    const editorPermissions = await client.query(
      "SELECT format('GRANT CONNECT ON DATABASE %I TO cards_editor', $1::text) AS sql",
      [databaseName],
    );
    await client.query(editorPermissions.rows[0].sql);
    await client.query('GRANT USAGE ON SCHEMA public TO cards_editor');

    const schemaDirectory = path.resolve(__dirname, '../database');
    const migrations = fs.readdirSync(schemaDirectory)
      .filter(name => /^\d{3}-.*\.sql$/.test(name))
      .sort();

    for (const name of migrations) {
      const sql = fs.readFileSync(path.join(schemaDirectory, name), 'utf8');
      await client.query(sql);
    }

    await client.query('COMMIT');
    const environmentPath = path.resolve(__dirname, '../.env');
    let environment = fs.readFileSync(environmentPath, 'utf8');

    if (!/^AUTH_DATABASE_URL=/m.test(environment)) {
      environment += `\nAUTH_DATABASE_URL=${config.authUrl}\n`;
    }

    if (!/^ADMIN_ORIGIN=/m.test(environment)) {
      environment += 'ADMIN_ORIGIN=http://127.0.0.1:4201\n';
    }

    if (!/^EDITOR_DATABASE_URL=/m.test(environment)) {
      environment += `EDITOR_DATABASE_URL=${config.editorUrl}\n`;
    }

    if (!/^PUBLIC_CARD_ORIGIN=/m.test(environment)) {
      environment += 'PUBLIC_CARD_ORIGIN=http://127.0.0.1:4200\n';
    }

    fs.writeFileSync(environmentPath, environment);
    console.log('Схема базы готова. Существующие визитки сохранены.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch(error => {
  console.error('Подготовка базы не завершена:', error.message);
  process.exitCode = 1;
});
