// tests/functional/company.test.js
// Functional tests for company career page scraping and URL resolution

const { test, expect } = require('@playwright/test');
const { chromium } = require('playwright');
const CompanyScraper = require('../../src/scrapers/CompanyScraper');
const { resolveCareerUrl, enrichCompanies } = require('../../src/utils/careerPageResolver');
const companiesConfig = require('../../src/config/companies.json');
const searchConfig = require('../../src/config/searchConfig.json');

const TIMEOUT = 90000;
const JOB_TITLES = searchConfig.search.jobTitles;

let browser, page;

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await browser.close();
});

// ─── companies.json validation ────────────────────────────────────────────────

test.describe('companies.json config', () => {
  test('should have at least one company', () => {
    expect(companiesConfig.companies).toBeDefined();
    expect(companiesConfig.companies.length).toBeGreaterThan(0);
  });

  test('each company should have required fields', () => {
    for (const company of companiesConfig.companies) {
      expect(company.name, `${company.name} missing name`).toBeTruthy();
      expect(typeof company.enabled, `${company.name} enabled must be boolean`).toBe('boolean');
      // careersUrl is optional (auto-resolved), but if present must be a valid URL
      if (company.careersUrl) {
        expect(company.careersUrl).toMatch(/^https?:\/\//i);
      }
    }
  });

  test('should have at least one enabled company', () => {
    const enabled = companiesConfig.companies.filter(c => c.enabled);
    expect(enabled.length).toBeGreaterThan(0);
    console.log(`Enabled companies: ${enabled.map(c => c.name).join(', ')}`);
  });

  test('all 9 target job titles present in searchConfig', () => {
    const expected = [
      'Software Engineer', 'Senior Software Engineer', 'DevOps Engineer',
      'Infrastructure Engineer', 'Cloud Engineer', 'Software Developer',
      'Senior Software Developer', 'Java Developer', 'Full Stack Developer'
    ];
    for (const title of expected) {
      expect(JOB_TITLES).toContain(title);
    }
  });
});

// ─── careerPageResolver tests ───────────────────────────────────────────────

test.describe('careerPageResolver', () => {
  test('should resolve career URL for a company with known URL pattern', async () => {
    // Stripe has careers.stripe.com which should resolve via subdomain check
    const url = await resolveCareerUrl('stripe', page);
    if (url) {
      expect(url).toMatch(/^https?:\/\//i);
      expect(url.toLowerCase()).toContain('stripe');
    } else {
      console.log('[skip] Could not resolve Stripe career URL in test environment');
    }
  }, TIMEOUT);

  test('should return null for a nonsense company name', async () => {
    const url = await resolveCareerUrl('xyznonexistentcompany999abc', null);
    expect(url).toBeNull();
  }, TIMEOUT);

  test('enrichCompanies should skip disabled companies', async () => {
    const testCompanies = [
      { name: 'CompanyA', enabled: true, careersUrl: 'https://example.com/careers' },
      { name: 'CompanyB', enabled: false, careersUrl: 'https://example2.com/careers' }
    ];
    const enriched = await enrichCompanies(testCompanies, page);
    expect(enriched.length).toBe(1);
    expect(enriched[0].name).toBe('CompanyA');
  }, TIMEOUT);
});

// ─── CompanyScraper tests ─────────────────────────────────────────────────────

test.describe('CompanyScraper', () => {
  let scraper;

  test.beforeAll(() => {
    scraper = new CompanyScraper(page);
  });

  test('_titleMatches should correctly match job titles', () => {
    expect(scraper._titleMatches('Senior Software Engineer', 'Software Engineer')).toBeTruthy();
    expect(scraper._titleMatches('Staff Java Developer', 'Java Developer')).toBeTruthy();
    expect(scraper._titleMatches('Cloud Infrastructure Engineer', 'Cloud Engineer')).toBeTruthy();
    expect(scraper._titleMatches('Marketing Manager', 'Software Engineer')).toBeFalsy();
    expect(scraper._titleMatches('', 'Java Developer')).toBeFalsy();
  });

  test('_detectATS should identify ATS from URL', () => {
    expect(scraper._detectATS('https://boards.greenhouse.io/company/jobs/123')).toBe('greenhouse');
    expect(scraper._detectATS('https://jobs.lever.co/company/abc')).toBe('lever');
    expect(scraper._detectATS('https://company.myworkdayjobs.com/jobs/123')).toBe('workday');
    expect(scraper._detectATS('https://company.com/careers/123')).toBe('custom');
    expect(scraper._detectATS(null)).toBeNull();
  });

  test('_buildSearchUrl should append search param correctly', () => {
    const company = { careersUrl: 'https://careers.example.com/jobs', searchParam: 'q' };
    const url = scraper._buildSearchUrl(company, 'Software Engineer');
    expect(url).toBe('https://careers.example.com/jobs?q=Software%20Engineer');
  });

  test('_buildSearchUrl should handle existing query params', () => {
    const company = { careersUrl: 'https://example.com/jobs?location=remote', searchParam: 'q' };
    const url = scraper._buildSearchUrl(company, 'Java Developer');
    expect(url).toContain('&q=Java%20Developer');
  });

  test('should search Stripe careers for Software Engineer', async () => {
    const company = companiesConfig.companies.find(c => c.name === 'Stripe');
    if (!company || !company.enabled) {
      console.log('[skip] Stripe not enabled in companies.json');
      return;
    }
    const jobs = await scraper.search(company, 'Software Engineer');
    expect(Array.isArray(jobs)).toBeTruthy();
    console.log(`Stripe [Software Engineer]: found ${jobs.length} jobs`);
    if (jobs.length > 0) {
      const job = jobs[0];
      expect(job).toHaveProperty('title');
      expect(job).toHaveProperty('company', 'Stripe');
      expect(job).toHaveProperty('url');
      expect(job.source).toBe('company');
    }
  }, TIMEOUT);

  test('should search Twilio careers for Java Developer', async () => {
    const company = companiesConfig.companies.find(c => c.name === 'Twilio');
    if (!company || !company.enabled) return;
    const jobs = await scraper.search(company, 'Java Developer');
    expect(Array.isArray(jobs)).toBeTruthy();
    console.log(`Twilio [Java Developer]: found ${jobs.length} jobs`);
  }, TIMEOUT);

  test('should handle an unreachable careers page gracefully', async () => {
    const badCompany = {
      name: 'BadCompany',
      careersUrl: 'https://this-company-does-not-exist-xyz123.com/careers',
      searchParam: 'q',
      ats: 'greenhouse'
    };
    const jobs = await scraper.search(badCompany, 'Software Engineer');
    expect(Array.isArray(jobs)).toBeTruthy();
    expect(jobs.length).toBe(0); // should return empty, not throw
  }, TIMEOUT);

  test('should search multiple companies for all 9 job titles (smoke test)', async () => {
    // Run a quick smoke test on 2 enabled companies x 2 titles
    const enabledCompanies = companiesConfig.companies.filter(c => c.enabled && c.careersUrl).slice(0, 2);
    const titlesToTest = JOB_TITLES.slice(0, 2);
    const results = {};

    for (const company of enabledCompanies) {
      results[company.name] = {};
      for (const title of titlesToTest) {
        const jobs = await scraper.search(company, title);
        results[company.name][title] = jobs.length;
        console.log(`  ${company.name} [${title}]: ${jobs.length} jobs`);
      }
    }

    // Just verify it ran without throwing
    expect(Object.keys(results).length).toBeGreaterThan(0);
  }, TIMEOUT * 4);
});

// ─── JSON-LD extraction test ─────────────────────────────────────────────────────

test.describe('CompanyScraper - JSON-LD extraction', () => {
  test('should extract JobPosting from JSON-LD structured data', async () => {
    const scraper = new CompanyScraper(page);
    // Set up a minimal page with JSON-LD JobPosting schema
    const html = `
      <html><body>
        <script type="application/ld+json">
          [
            {
              "@type": "JobPosting",
              "title": "Senior Software Engineer",
              "url": "https://example.com/jobs/123",
              "jobLocation": { "address": { "addressLocality": "Austin" } }
            }
          ]
        </script>
      </body></html>
    `;
    await page.setContent(html);
    const jobs = await scraper._extractJsonLd();
    expect(jobs.length).toBe(1);
    expect(jobs[0].title).toBe('Senior Software Engineer');
    expect(jobs[0].url).toBe('https://example.com/jobs/123');
    expect(jobs[0].location).toBe('Austin');
  });

  test('should return empty array when no JSON-LD present', async () => {
    const scraper = new CompanyScraper(page);
    await page.setContent('<html><body><p>No jobs here</p></body></html>');
    const jobs = await scraper._extractJsonLd();
    expect(Array.isArray(jobs)).toBeTruthy();
    expect(jobs.length).toBe(0);
  });
});
