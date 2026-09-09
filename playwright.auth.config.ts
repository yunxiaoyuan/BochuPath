import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Every run has its own service database; never touch local or production diagrams.
const dataDirectory = mkdtempSync(join(tmpdir(), 'bochupath-auth-e2e-'));

export default defineConfig({
  testDir: './e2e',
  testMatch: 'auth-permissions.spec.ts',
  outputDir: './test-results/auth',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5182',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev:auth -- --port 5182',
    url: 'http://127.0.0.1:5182',
    reuseExistingServer: false,
    env: {
      ...process.env,
      BOCHUPATH_API_PORT: '4183',
      BOCHUPATH_DEMO_DATA_DIRECTORY: dataDirectory,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
