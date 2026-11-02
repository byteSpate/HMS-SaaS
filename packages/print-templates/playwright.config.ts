import { defineConfig, devices } from '@playwright/test';

// No web server: these tests render templates straight to PDF (T-PRN-01).
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
