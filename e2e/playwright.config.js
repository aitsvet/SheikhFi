import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEBAPP_URL || 'http://localhost:5173',
  },
});
