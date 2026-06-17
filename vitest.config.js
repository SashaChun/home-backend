import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js'],
    env: {
      ACCESS_TOKEN_SECRET: 'test_access_secret',
      REFRESH_TOKEN_SECRET: 'test_refresh_secret',
      NODE_ENV: 'test',
    },
  },
});
