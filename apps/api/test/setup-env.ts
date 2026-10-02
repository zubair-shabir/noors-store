import 'dotenv/config';
import { testDatabaseUrl } from './test-database-url.js';

// Everything under test, including createApp's Prisma client, uses the test database.
process.env.DATABASE_URL = testDatabaseUrl();
