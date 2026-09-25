// Prepare an existing, empty application database using local PostgreSQL administration.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { isIP } = require('node:net');

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

function readOrigin(value, internalHttp) {
  const url = new URL(value);
  const protocol = internalHttp ? 'http:' : 'https:';
  if (url.protocol !== protocol || url.origin !== value) {
    throw new Error('Provide two site origins with the required protocol, without a path or trailing slash.');
  }
  if (internalHttp) {
    const [first, second] = url.hostname.split('.').map(Number);
    const privateAddress = first === 10 || first === 127
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
    if (isIP(url.hostname) !== 4 || !privateAddress) {
      throw new Error('Internal HTTP is only supported for private IPv4 addresses.');
    }
  }
  return value;
}

function main() {
  if (process.platform !== 'linux' || process.getuid() !== 0) {
    throw new Error('Run this script with sudo on the target Ubuntu server.');
  }
  const internalHttp = process.argv[5] === '--internal-http';
  if (process.argv.length > 6 || (process.argv[5] && !internalHttp)) {
    throw new Error('Unknown option. Optional fifth argument: --internal-http.');
  }
  const adminOrigin = readOrigin(process.argv[2], internalHttp);
  const publicOrigin = readOrigin(process.argv[3], internalHttp);
  const database = process.argv[4] || 'razildb';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(database)) {
    throw new Error('Database name must contain lowercase letters, digits or underscores.');
  }
  if (adminOrigin === publicOrigin) {
    throw new Error('Use separate origins for the cabinet and public cards.');
  }
  const envPath = '/etc/digital-cards/backend.env';
  if (fs.existsSync(envPath)) {
    throw new Error('Configuration already exists. Edit backend.env if needed; do not reinitialize the database.');
  }
  const databaseExists = psql('postgres', `SELECT 1 FROM pg_database WHERE datname = '${database}';`);
  if (databaseExists !== '1') {
    throw new Error('The application database must already exist. This script does not create databases.');
  }
  const existing = psql('postgres', `
    SELECT 1 FROM pg_roles WHERE rolname IN ('cards_public', 'cards_auth', 'cards_editor');
  `);
  if (existing) {
    throw new Error('Application roles already exist. Initialization will not overwrite them.');
  }
  const existingObjects = psql(database, `
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') LIMIT 1;
  `);
  if (existingObjects) {
    throw new Error('The public schema is not empty. Ask the database administrator to review it first.');
  }

  const roles = ['cards_public', 'cards_auth', 'cards_editor'];
  const passwords = {};
  for (const role of roles) {
    passwords[role] = randomBytes(32).toString('hex');
  }
  function databaseUrl(role) {
    return `postgresql://${role}:${passwords[role]}@127.0.0.1:5432/${database}`;
  }
  const environment = [
    'NODE_ENV=production',
    `INTERNAL_HTTP=${internalHttp}`,
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

  let schema = 'BEGIN;\n';
  for (const role of roles) {
    schema += `CREATE ROLE ${role} LOGIN PASSWORD '${passwords[role]}' NOSUPERUSER NOCREATEDB NOCREATEROLE;\n`;
  }
  schema += `
    REVOKE ALL ON DATABASE "${database}" FROM PUBLIC;
    GRANT CONNECT ON DATABASE "${database}" TO cards_public, cards_auth, cards_editor;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO cards_public, cards_auth, cards_editor;
    ALTER ROLE cards_public SET default_transaction_read_only = on;
  `;
  const schemaDir = path.resolve(__dirname, '../backend/database');
  const files = fs.readdirSync(schemaDir).filter(name => /^\d{3}-.*\.sql$/.test(name)).sort();
  for (const name of files) {
    schema += fs.readFileSync(path.join(schemaDir, name), 'utf8') + '\n';
  }
  schema += 'COMMIT;';
  psql(database, schema);
  console.log('Database initialized. Credentials are in /etc/digital-cards/backend.env (root only).');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
