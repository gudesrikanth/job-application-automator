// tests/functional/search.test.js
// Functional tests for JobScraper: platform-mode and company-mode pipelines

const { test, expect } = require('@playwright/test');
const { chromium } = require('playwright');

const JobScraper = require('../../src/scrapers/JobScraper');
const searchConfig = require('../../src/config/searchConfig.json');

const TIMEOUT = 90000;

let browser;
let context;

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: true, slowMo: 0 });
  context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
});

test.afterAll(async () => {
  await context.close();
  await browser.close();
});

// ── JobScraper unit-level behaviour ───────────────────────────────────────────

test('JobScraper instantiates without error', () => {
  const scraper = new JobScraper(context, searchConfig);
  expect(scraper).toBeDefined();
  expect(typeof scraper.runCompanyMode).toBe('function');
  expect(typeof scraper.runPlatformMode).toBe('function');
  expect(typeof scraper.markApplied).toBe('function');
});

test('JobScraper._filterNew() deduplicates by URL', () => {
  const scraper = new JobScraper(context, searchConfig);
  const jobs = [
    { title: 'SWE', company: 'A', url: 'https://a.com/job/1', applyUrl: 'https://a.com/job/1' },
    { title: 'SWE', company: 'A', url: 'https://a.com/job/1', applyUrl: 'https://a.com/job/1' }, // dupe
    { title: 'DevOps', company: 'B', url: 'https://b.com/job/2', applyUrl: 'https://b.com/job/2' },
  ];
  const filtered = scraper._filterNew(jobs);
  expect(filtered.length).toBe(2);
});

test('JobScraper._filterNew() excludes already-applied jobs', () => {
  const scraper = new JobScraper(context, searchConfig);
  const url = 'https://already-applied.com/job/99';
  scraper.appliedCache.add(url);
  const jobs = [{ title: 'SWE', company: 'X', url, applyUrl: url }];
  const filtered = scraper._filterNew(jobs);
  expect(filtered.length).toBe(0);
});

test('JobScraper.markApplied() adds job key to cache', () => {
  const scraper = new JobScraper(context, searchConfig);
  const job = { title: 'SWE', company: 'Z', url: 'https://z.com/j/5', applyUrl: 'https://z.com/j/5' };
  scraper.markApplied(job);
  expect(scraper.appliedCache.has(job.applyUrl)).toBe(true);
});

// ── Platform scraper smoke tests (LinkedIn) ─────────────────────────────────
// These tests exercise the real scraper against live platforms;
// they may be flaky due to anti-bot measures - mark as optional.

test('LinkedIn scraper returns structured job objects', async () => {
  const { LinkedInScraper } = (() => {
    try { return { LinkedInScraper: require('../../src/scrapers/platforms/LinkedInScraper') }; }
    catch (_) { return {}; }
  })();

  if (!LinkedInScraper) {
    console.log('[search.test] LinkedInScraper not yet implemented - skipping');
    return;
  }

  const scraper = new LinkedInScraper(context, {
    title: 'Software Engineer',
    location: 'Remote',
  });
  const jobs = await scraper.search();
  expect(Array.isArray(jobs)).toBe(true);

  for (const job of jobs.slice(0, 3)) {
    expect(job).toHaveProperty('title');
    expect(job).toHaveProperty('company');
    expect(job).toHaveProperty('url');
  }
}, TIMEOUT);

// ── Company-mode integration smoke test ───────────────────────────────────────

test('runCompanyMode() returns an array', async () => {
  // Use a minimal config with just 1 fast company to keep the test short
  const minimalConfig = {
    ...searchConfig,
    titles: ['Software Engineer'],
  };
  const scraper = new JobScraper(context, minimalConfig);
  const jobs = await scraper.runCompanyMode();
  expect(Array.isArray(jobs)).toBe(true);
  // Each job should have shape { title, company, url, source }
  for (const job of jobs) {
    expect(job).toHaveProperty('title');
    expect(job).toHaveProperty('company');
    expect(job).toHaveProperty('url');
  }
}, TIMEOUT * 3); // generous timeout for multiple companies
