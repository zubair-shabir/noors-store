/** Where the store and the API run during the tests. */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

/** The development owner account from apps/api/prisma/seed.ts. */
export const OWNER = {
  email: process.env.E2E_OWNER_EMAIL ?? 'owner@noors.local',
  password: process.env.E2E_OWNER_PASSWORD ?? 'noors-dev-password',
};
