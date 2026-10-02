import { execFileSync } from 'node:child_process';
import 'dotenv/config';
import pg from 'pg';
import { testDatabaseUrl } from './test-database-url.js';

/**
 * Integration tests truncate every table, so they run against their own database
 * (TEST_DATABASE_URL, e.g. .../noors_test). This creates it if needed and applies migrations.
 */
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  admin.search = '';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'ignore',
  });
}
