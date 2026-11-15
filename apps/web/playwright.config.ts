import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import path from 'node:path';

// Đọc file .env.e2e tại thư mục gốc monorepo.
config({
  path: path.resolve(__dirname, '../../.env.e2e'),
});

export default defineConfig({
  testDir: './tests',

  fullyParallel: false,
  workers: 1,
  retries: 0,

  reporter: [['list'], ['html', { open: 'never' }]],

  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});