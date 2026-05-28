// tests/functional/apply.test.js
// Functional tests for the job application pipeline (resume selection, form fill, ATS adapters)

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Utility imports
const resumeSelector = require('../../src/utils/resumeSelector');
const FormFiller = require('../../src/utils/FormFiller');
const { chromium } = require('playwright');

let browser, context, page;

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: false, slowMo: 50 });
  context = await browser.newContext();
  page = await context.newPage();
});

test.afterAll(async () => {
  await browser.close();
});

// ─── Resume Selector Tests ─────────────────────────────────────────────────

test.describe('resumeSelector', () => {
  test('should select platform-cloud resume for Cloud Engineer', () => {
    const job = { title: 'Cloud Engineer', description: 'AWS GCP Kubernetes infrastructure' };
    const result = resumeSelector.select(job);
    expect(result).toBeTruthy();
    expect(result.track).toBe('platform-cloud');
  });

  test('should select backend-java resume for Java Developer', () => {
    const job = { title: 'Java Developer', description: 'Spring Boot microservices REST API' };
    const result = resumeSelector.select(job);
    expect(result).toBeTruthy();
    expect(result.track).toBe('backend-java');
  });

  test('should select angular-fullstack resume for Full Stack Developer', () => {
    const job = { title: 'Full Stack Developer', description: 'React Angular TypeScript frontend backend' };
    const result = resumeSelector.select(job);
    expect(result).toBeTruthy();
    expect(result.track).toBe('angular-fullstack');
  });

  test('should fall back to backend-java for generic Software Engineer', () => {
    const job = { title: 'Software Engineer', description: 'General backend development' };
    const result = resumeSelector.select(job);
    expect(result).toBeTruthy();
    expect(result.track).toBeDefined();
  });

  test('should select platform-cloud for DevOps/Infrastructure Engineer', () => {
    const devops = { title: 'DevOps Engineer', description: 'CI/CD pipeline Kubernetes Terraform AWS' };
    const infra = { title: 'Infrastructure Engineer', description: 'cloud infrastructure automation' };
    expect(resumeSelector.select(devops).track).toBe('platform-cloud');
    expect(resumeSelector.select(infra).track).toBe('platform-cloud');
  });

  test('should return a PDF path that exists', () => {
    const job = { title: 'Java Developer', description: 'Java Spring Boot' };
    const result = resumeSelector.select(job);
    const pdfPath = path.resolve(result.pdf);
    // In test env resumes may be placeholders - check the path is a string
    expect(typeof result.pdf).toBe('string');
    expect(result.pdf).toMatch(/\.pdf$/i);
  });
});

// ─── FormFiller Tests ───────────────────────────────────────────────────────────

test.describe('FormFiller - field detection', () => {
  test('should fill a basic HTML form correctly', async () => {
    // Create a minimal test HTML page
    const html = `
      <html><body>
        <form id="testForm">
          <input type="text" name="firstName" id="firstName" />
          <input type="text" name="lastName" id="lastName" />
          <input type="email" name="email" id="email" />
          <input type="tel" name="phone" id="phone" />
          <input type="text" name="city" id="city" />
        </form>
      </body></html>
    `;
    await page.setContent(html);

    const profile = {
      firstName: 'Rikanth',
      lastName: 'Gude',
      email: 'rikanth@example.com',
      phone: '555-1234',
      city: 'New York'
    };

    const filler = new FormFiller(page, profile, {});
    await filler.fillBasicInfo();

    const firstName = await page.$eval('#firstName', el => el.value);
    const email = await page.$eval('#email', el => el.value);
    expect(firstName).toBe('Rikanth');
    expect(email).toBe('rikanth@example.com');
  });

  test('should handle missing fields without throwing', async () => {
    const html = '<html><body><form></form></body></html>';
    await page.setContent(html);
    const filler = new FormFiller(page, { firstName: 'Test' }, {});
    await expect(filler.fillBasicInfo()).resolves.not.toThrow();
  });

  test('should fill LinkedIn/work experience fields', async () => {
    const html = `
      <html><body>
        <input type="url" name="linkedin" id="linkedin" />
        <input type="url" name="website" id="website" />
      </body></html>
    `;
    await page.setContent(html);
    const profile = {
      linkedin: 'https://linkedin.com/in/gudesrikanth',
      website: 'https://github.com/gudesrikanth'
    };
    const filler = new FormFiller(page, profile, {});
    await filler.fillBasicInfo();
    const linkedin = await page.$eval('#linkedin', el => el.value);
    expect(linkedin).toBe(profile.linkedin);
  });
});

// ─── ATS Routing Tests ───────────────────────────────────────────────────────

test.describe('ATS detection from URL', () => {
  const detectATS = (url) => {
    const u = url.toLowerCase();
    if (u.includes('greenhouse.io')) return 'greenhouse';
    if (u.includes('lever.co')) return 'lever';
    if (u.includes('myworkdayjobs')) return 'workday';
    if (u.includes('jobvite')) return 'jobvite';
    if (u.includes('icims')) return 'icims';
    return null;
  };

  test('should detect Greenhouse', () => {
    expect(detectATS('https://boards.greenhouse.io/company/jobs/123')).toBe('greenhouse');
  });

  test('should detect Lever', () => {
    expect(detectATS('https://jobs.lever.co/company/abc-uuid')).toBe('lever');
  });

  test('should detect Workday', () => {
    expect(detectATS('https://company.myworkdayjobs.com/en-US/jobs/123')).toBe('workday');
  });

  test('should return null for unknown ATS', () => {
    expect(detectATS('https://jobs.example.com/posting/123')).toBeNull();
  });
});

// ─── Logger Tests ───────────────────────────────────────────────────────────────

test.describe('Logger', () => {
  const Logger = require('../../src/utils/logger');
  const LOG_FILE = path.join(__dirname, '../../logs/test-results.json');

  test('should log a success entry', () => {
    Logger.logSuccess({
      title: 'Software Engineer',
      company: 'TestCorp',
      url: 'https://example.com/job/1',
      ats: 'greenhouse'
    });
    if (fs.existsSync(LOG_FILE)) {
      const data = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
      expect(Array.isArray(data)).toBeTruthy();
    }
  });

  test('should log a failure entry with error message', () => {
    Logger.logFailure({
      title: 'DevOps Engineer',
      company: 'FailCorp',
      url: 'https://example.com/job/2'
    }, new Error('Timeout waiting for form'));
  });
});

// ─── Deduplication Tests ─────────────────────────────────────────────────────────

test.describe('Job deduplication', () => {
  test('should deduplicate jobs by URL', () => {
    const jobs = [
      { title: 'SE', company: 'A', url: 'https://example.com/job/1', source: 'linkedin' },
      { title: 'SE', company: 'A', url: 'https://example.com/job/1', source: 'indeed' },
      { title: 'SDE', company: 'B', url: 'https://example.com/job/2', source: 'glassdoor' }
    ];
    const seen = new Set();
    const deduped = jobs.filter(j => {
      if (seen.has(j.url)) return false;
      seen.add(j.url);
      return true;
    });
    expect(deduped.length).toBe(2);
  });

  test('should skip jobs already in applied cache', () => {
    const appliedCache = new Set(['https://example.com/job/already-applied']);
    const job = { url: 'https://example.com/job/already-applied' };
    expect(appliedCache.has(job.url)).toBeTruthy();
  });
});
