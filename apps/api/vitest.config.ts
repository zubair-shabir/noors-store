import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    setupFiles: ['dotenv/config'],
    // Integration tests share one database, so test files run one at a time.
    fileParallelism: false,
  },
});
