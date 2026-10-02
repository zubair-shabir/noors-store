/** The database integration tests use. Its name must end in "_test" so a dev database is never wiped. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Integration tests need their own Postgres database: ' +
        'add TEST_DATABASE_URL=postgresql://noors:noors@localhost:5432/noors_test?schema=public to apps/api/.env.',
    );
  }
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL points at "${name}". Use a database whose name ends in "_test".`,
    );
  }
  return url;
}
