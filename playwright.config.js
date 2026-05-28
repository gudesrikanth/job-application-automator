// playwright.config.js
// Playwright Test configuration for the functional test suite

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/functional',
  timeout: 120_000,          // 2 min per test (scraping can be slow)
  expect: { timeout: 15_000 },
  fullyParallel: false,      // run sequentially to avoid bot detection
  retries: 1,                // retry once on failure
  workers: 1,                // single worker
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/html-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  use: {
    headless: false,
    slowMo: 50,
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  outputDir: 'test-results/artifacts'
});
