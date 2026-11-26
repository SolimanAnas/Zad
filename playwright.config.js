const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    headless: true,
    baseURL: 'http://localhost:8080',
    // Set PW_CHROMIUM to use a Chromium you already have instead of Playwright's own.
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  webServer: {
    command: 'node tests/server.js',
    port: 8080,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
