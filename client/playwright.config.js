// @ts-check
import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for Manhattan E2E tests.
 * Tests target the Nginx-served client at http://localhost:8080.
 * Requires a running server (Spring Boot + MySQL + Nginx) — intended for CI/deployment.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
