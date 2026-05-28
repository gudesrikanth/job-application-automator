// tests/functional/company.test.js
// Functional tests for company career page discovery and scraping.

const { test, expect } = require('@playwright/test');
const { chromium } = require('playwright');
const path = require('path');

const CompanyScraper = require('../../src/scrapers/CompanyScraper');
const { resolve, enrich, probeCommonPaths } = require('../../src/utils/careerPageResolver');
const companies = require('../../src/config/companies.json');
const searchConfig = require('../../src/config/searchConfig.json');

const TIMEOUT = 60000;
const TEST_TITLES = ['Software Engineer', 'DevOps Engineer'];

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

// ── Config validation ─────────────────────────────────────────────────────────────

test('companies.json is a non-empty array', () => {
  expect(Array.isArray(companies)).toBe(true);
  expect(companies.length).toBeGreaterThan(0);
});

test('every company entry has required fields', () => {
  for (const company of companies) {
    expect(company).toHaveProperty('name');
    expect(typeof company.name).toBe('string');
    expect(company).toHaveProperty('enabled');
    // Must have careersUrl OR domain (so resolver can fill it in)
    const hasUrl = !!company.careersUrl;
    const hasDomain = !!company.domain;
    expect(hasUrl || hasDomain).toBe(true);
  }
});

test('searchConfig.json has titles array', () => {
  expect(Array.isArray(searchConfig.titles)).toBe(true);
  expect(searchConfig.titles.length).toBeGreaterThan(0);
});

test('all enabled companies have careersUrl or domain', () => {
  const enabled = companies.filter((c) => c.enabled);
  for (const c of enabled) {
    const ok = !!c.careersUrl || !!c.domain;
    expect(ok).toBe(true);
  }
});

// ── careerPageResolver tests ─────────────────────────────────────────────────────

test('resolve() returns existing careersUrl without hitting network', async () => {
  const company = { name: 'Test', careersUrl: 'https://example.com/careers', domain: 'example.com' };
  const result = await resolve(company, context);
  expect(result).toBe('https://example.com/careers');
}, TIMEOUT);

test('resolve() returns null when domain is missing and no careersUrl', async () => {
  const company = { name: 'NoDomain', enabled: true };
  const result = await resolve(company, context);
  expect(result).toBeNull();
}, TIMEOUT);

test('probeCommonPaths finds careers URL for stripe.com', async () => {
  const result = await probeCommonPaths(context, 'stripe.com');
  expect(result).toBeTruthy();
  expect(result).toMatch(/stripe\.com/);
}, TIMEOUT);

test('enrich() passes through companies with existing careersUrl unchanged', async () => {
  const input = [
    { name: 'A', careersUrl: 'https://a.com/jobs', enabled: true },
    { name: 'B', careersUrl: 'https://b.com/careers', enabled: true },
  ];
  const result = await enrich(input, context);
  expect(result[0].careersUrl).toBe('https://a.com/jobs');
  expect(result[1].careersUrl).toBe('https://b.com/careers');
}, TIMEOUT);

// ── CompanyScraper smoke tests ─────────────────────────────────────────────────────

test('CompanyScraper.scrape() returns an array for Greenhouse company', async () => {
  const company = companies.find((c) => c.name === 'Twilio');
  if (!company || !company.enabled) {
    test.skip();
    return;
  }
  const scraper = new CompanyScraper(context, company, TEST_TITLES);
  const jobs = await scraper.scrape();
  expect(Array.isArray(jobs)).toBe(true);
  for (const job of jobs) {
    expect(job).toHaveProperty('title');
    expect(job).toHaveProperty('company');
    expect(job).toHaveProperty('url');
    expect(job).toHaveProperty('source', 'company-page');
  }
}, TIMEOUT);

test('CompanyScraper.scrape() returns an array for Lever company', async () => {
  const company = companies.find((c) => c.name === 'HashiCorp');
  if (!company || !company.enabled) {
    test.skip();
    return;
  }
  const scraper = new CompanyScraper(context, company, TEST_TITLES);
  const jobs = await scraper.scrape();
  expect(Array.isArray(jobs)).toBe(true);
}, TIMEOUT);

test('CompanyScraper handles unreachable URL gracefully', async () => {
  const company = {
    name: 'FakeCompany',
    careersUrl: 'https://this-domain-does-not-exist-xyzabc.com/careers',
    ats: 'generic',
    enabled: true,
  };
  const scraper = new CompanyScraper(context, company, TEST_TITLES);
  const jobs = await scraper.scrape();
  expect(Array.isArray(jobs)).toBe(true);
  expect(jobs.length).toBe(0);
}, TIMEOUT);
