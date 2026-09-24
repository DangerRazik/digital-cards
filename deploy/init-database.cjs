// Run once as root on Ubuntu, with local PostgreSQL 17 and its postgres OS user.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');

function psql(database, sql) {
  const result = spawnSync('runuser', [
    '-u', 'postgres', '--', 'psql', '-X', '-q', '-t', '-A',
    '-v', 'ON_ERROR_STOP=1', '-d', database,
  ], { input: sql, encoding: 'utf8', cwd: '/tmp' });
  if (result.error || result.status !== 0) {
    // SQL can contain generated passwords; never echo it or stderr.
    throw new Error('PostgreSQL setup failed. Check the local service and existing roles.');
  }
  return result.stdout.trim();
}

function readOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value) {
    throw new Error('Provide two HTTPS origins without a trailing slash or path.');
  }
  return value;
}

function main() {
  if (process.platform !== 'linux' || process.getuid() !== 0) {
    throw new Error('Run this script with sudo on the target Ubuntu server.');
  }
  const adminOrigin = readOrigin(process.argv[2]);
  const publicOrigin = readOrigin(process.argv[3]);
  if (adminOrigin === publicOrigin) {
    throw new Error('Use separate origins for the cabinet and public cards.');
  }
  const envPath = '/etc/digital-cards/backend.env';
  if (fs.existsSync(envPath)) {
    throw new Error('Configuration already exists. For updates use migrate.sh; do not reinitialize.');
  }
  const existing = psql('postgres', `
    SELECT 1 FROM pg_database WHERE datname = 'digital_cards'
    UNION ALL
    SELECT 1 FROM pg_roles WHERE rolname IN ('cards_public', 'cards_auth', 'cards_editor');
  `);
  if (existing) {
    throw new Error('Database or roles already exist. Initialization will not overwrite them.');
  }

  const roles = ['cards_public', 'cards_auth', 'cards_editor'];
  const passwords = {};
  for (const role of roles) {
    passwords[role] = randomBytes(32).toString('hex');
  }
  function databaseUrl(role) {
    return `postgresql://${role}:${passwords[role]}@127.0.0.1:5432/digital_cards`;
  }
  const environment = [
    'NODE_ENV=production',
    'HOST=127.0.0.1',
    'PORT=3000',
    'TRUST_LOCAL_PROXY=true',
    `ADMIN_ORIGIN=${adminOrigin}`,
    `PUBLIC_CARD_ORIGIN=${publicOrigin}`,
    `DATABASE_URL=${databaseUrl('cards_public')}`,
    `AUTH_DATABASE_URL=${databaseUrl('cards_auth')}`,
    `EDITOR_DATABASE_URL=${databaseUrl('cards_editor')}`,
    'UPLOAD_DIRECTORY=/var/lib/digital-cards/images',
    '',
  ].join('\n');
  fs.mkdirSync('/etc/digital-cards', { recursive: true, mode: 0o700 });
  // Keep the generated credentials even if a later initialization step fails.
  fs.writeFileSync(envPath, environment, { flag: 'wx', mode: 0o600 });

  let roleSql = 'BEGIN;\n';
  for (const role of roles) {
    roleSql += `CREATE ROLE ${role} LOGIN PASSWORD '${passwords[role]}' NOSUPERUSER NOCREATEDB NOCREATEROLE;\n`;
  }
  roleSql += 'COMMIT;';
  psql('postgres', roleSql);
  psql('postgres', 'CREATE DATABASE digital_cards;');
  psql('digital_cards', `
    REVOKE ALL ON DATABASE digital_cards FROM PUBLIC;
    GRANT CONNECT ON DATABASE digital_cards TO cards_public, cards_auth, cards_editor;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO cards_public, cards_auth, cards_editor;
    ALTER ROLE cards_public SET default_transaction_read_only = on;
  `);
  const schemaDir = path.resolve(__dirname, '../backend/database');
  const files = fs.readdirSync(schemaDir).filter(name => /^\d{3}-.*\.sql$/.test(name)).sort();
  let schema = 'BEGIN;\n';
  for (const name of files) {
    schema += fs.readFileSync(path.join(schemaDir, name), 'utf8') + '\n';
  }
  schema += 'COMMIT;';
  psql('digital_cards', schema);
  console.log('Database initialized. Credentials are in /etc/digital-cards/backend.env (root only).');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
