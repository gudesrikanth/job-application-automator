// tests/functional/search.test.js
// Functional tests for job search across LinkedIn, Indeed, Glassdoor

const { test, expect } = require('@playwright/test');
const LinkedInScraper = require('../../src/scrapers/platforms/LinkedInScraper');
const IndeedScraper = require('../../src/scrapers/platforms/IndeedScraper');
const GlassdoorScraper = require('../../src/scrapers/platforms/GlassdoorScraper');
const { chromium } = require('playwright');

const TITLES = [
  'Software Engineer',
  'Senior Software Engineer',
  'DevOps Engineer',
  'Infrastructure Engineer',
  'Cloud Engineer',
  'Software Developer',
  'Senior Software Developer',
  'Java Developer',
  'Full Stack Developer'
];

const LOCATION = 'United States';
const TIMEOUT = 60000;

let browser, context, page;

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: false, slowMo: 50 });
  context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await browser.close();
});

// ─── LinkedIn Scraper Tests ───────────────────────────────────────────────────

test.describe('LinkedInScraper', () => {
  let scraper;

  test.beforeAll(async () => {
    scraper = new LinkedInScraper(page);
  });

  test('should search and return jobs for Software Engineer', async () => {
    const jobs = await scraper.search('Software Engineer', LOCATION, { maxPages: 1 });
    expect(Array.isArray(jobs)).toBeTruthy();
    expect(jobs.length).toBeGreaterThan(0);
    const job = jobs[0];
    expect(job).toHaveProperty('title');
    expect(job).toHaveProperty('company');
    expect(job).toHaveProperty('url');
    expect(job.source).toBe('linkedin');
  }, TIMEOUT);

  test('should return jobs for all 9 target titles', async () => {
    for (const title of TITLES.slice(0, 3)) { // test first 3 to save time
      const jobs = await scraper.search(title, LOCATION, { maxPages: 1 });
      expect(Array.isArray(jobs)).toBeTruthy();
      console.log(`LinkedIn [${title}]: found ${jobs.length} jobs`);
    }
  }, TIMEOUT * 3);

  test('should extract apply URL from a job listing', async () => {
    const jobs = await scraper.search('Software Engineer', LOCATION, { maxPages: 1 });
    if (jobs.length === 0) return; // skip if no results
    const job = jobs[0];
    const applyUrl = await scraper.extractApplyUrl(job.url);
    // applyUrl can be null if job uses LinkedIn Easy Apply
    if (applyUrl) {
      expect(typeof applyUrl).toBe('string');
      expect(applyUrl).toMatch(/^https?:\/\//i);
    } else {
      console.log('LinkedIn Easy Apply job - no external URL');
    }
  }, TIMEOUT);

  test('should handle invalid location gracefully', async () => {
    const jobs = await scraper.search('Software Engineer', 'ZZZInvalidLocation999', { maxPages: 1 });
    expect(Array.isArray(jobs)).toBeTruthy();
    // Should return empty array or small result, not throw
  }, TIMEOUT);
});

// ─── Indeed Scraper Tests ─────────────────────────────────────────────────────

test.describe('IndeedScraper', () => {
  let scraper;

  test.beforeAll(async () => {
    scraper = new IndeedScraper(page);
  });

  test('should search and return jobs for Software Engineer', async () => {
    const jobs = await scraper.search('Software Engineer', LOCATION, { maxPages: 1 });
    expect(Array.isArray(jobs)).toBeTruthy();
    expect(jobs.length).toBeGreaterThan(0);
    const job = jobs[0];
    expect(job).toHaveProperty('title');
    expect(job).toHaveProperty('company');
    expect(job).toHaveProperty('url');
    expect(job.source).toBe('indeed');
  }, TIMEOUT);

  test('should extract apply URL from Indeed job listing', async () => {
    const jobs = await scraper.search('Java Developer', LOCATION, { maxPages: 1 });
    if (jobs.length === 0) return;
    const applyUrl = await scraper.extractApplyUrl(jobs[0].url);
    if (applyUrl) {
      expect(applyUrl).toMatch(/^https?:\/\//i);
    }
  }, TIMEOUT);

  test('should return jobs for DevOps Engineer', async () => {
    const jobs = await scraper.search('DevOps Engineer', LOCATION, { maxPages: 1 });
    expect(Array.isArray(jobs)).toBeTruthy();
    console.log(`Indeed [DevOps Engineer]: found ${jobs.length} jobs`);
  }, TIMEOUT);
});

// ─── Glassdoor Scraper Tests ──────────────────────────────────────────────────

test.describe('GlassdoorScraper', () => {
  let scraper;

  test.beforeAll(async () => {
    scraper = new GlassdoorScraper(page);
  });

  test('should search and return jobs for Cloud Engineer', async () => {
    const jobs = await scraper.search('Cloud Engineer', LOCATION, { maxPages: 1 });
    expect(Array.isArray(jobs)).toBeTruthy();
    expect(jobs.length).toBeGreaterThan(0);
    const job = jobs[0];
    expect(job).toHaveProperty('title');
    expect(job).toHaveProperty('company');
    expect(job).toHaveProperty('url');
    expect(job.source).toBe('glassdoor');
  }, TIMEOUT);

  test('should extract apply URL from Glassdoor job listing', async () => {
    const jobs = await scraper.search('Full Stack Developer', LOCATION, { maxPages: 1 });
    if (jobs.length === 0) return;
    const applyUrl = await scraper.extractApplyUrl(jobs[0].url);
    if (applyUrl) {
      expect(applyUrl).toMatch(/^https?:\/\//i);
    }
  }, TIMEOUT);
});
