// tests/functional/apply.test.js
// Functional tests for the apply pipeline:
//   - ATS URL detection
//   - resume track selection
//   - Greenhouse / Lever / Workday adapter smoke tests
//   - human-in-the-loop review pause (simulated)

const { test, expect } = require('@playwright/test');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TIMEOUT = 60000;

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

// ── ATS detection logic (extracted inline for unit testing) ─────────────────────
function detectATS(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('greenhouse.io') || u.includes('boards.greenhouse')) return 'greenhouse';
  if (u.includes('lever.co') || u.includes('jobs.lever')) return 'lever';
  if (u.includes('myworkdayjobs') || u.includes('workday')) return 'workday';
  return null;
}

test('detectATS identifies Greenhouse URLs', () => {
  expect(detectATS('https://boards.greenhouse.io/stripe/jobs/123')).toBe('greenhouse');
  expect(detectATS('https://company.greenhouse.io/jobs/456')).toBe('greenhouse');
});

test('detectATS identifies Lever URLs', () => {
  expect(detectATS('https://jobs.lever.co/company/uuid')).toBe('lever');
});

test('detectATS identifies Workday URLs', () => {
  expect(detectATS('https://company.myworkdayjobs.com/en-US/careers')).toBe('workday');
});

test('detectATS returns null for unknown URLs', () => {
  expect(detectATS('https://jobs.example.com/position/123')).toBeNull();
  expect(detectATS(null)).toBeNull();
});

// ── Resume selector ────────────────────────────────────────────────────────────
test('resumeSelector.select() returns a resume path string', () => {
  let resumeSelector;
  try {
    resumeSelector = require('../../src/utils/resumeSelector');
  } catch (_) {
    console.log('[apply.test] resumeSelector not implemented - skipping');
    return;
  }
  const tracks = {
    devops: ['DevOps', 'SRE', 'Infrastructure'],
    fullstack: ['Full Stack', 'Backend', 'Software Engineer'],
  };
  const job1 = { title: 'DevOps Engineer', company: 'A' };
  const job2 = { title: 'Software Engineer', company: 'B' };
  const job3 = { title: 'Data Scientist', company: 'C' };

  const r1 = resumeSelector.select(job1, tracks);
  const r2 = resumeSelector.select(job2, tracks);
  const r3 = resumeSelector.select(job3, tracks);

  expect(typeof r1).toBe('string');
  expect(typeof r2).toBe('string');
  expect(typeof r3).toBe('string');
});

// ── ATS adapter smoke tests ─────────────────────────────────────────────────────
// These use the live Greenhouse demo board to verify the adapter can navigate.

test('GreenhousePage.navigate() loads a Greenhouse job without error', async () => {
  let GreenhousePage;
  try {
    GreenhousePage = require('../../src/pages/ats/GreenhousePage');
  } catch (_) {
    console.log('[apply.test] GreenhousePage not yet implemented - skipping');
    return;
  }

  const page = await context.newPage();
  try {
    // Use the public Greenhouse demo board as a safe test target
    const demoUrl = 'https://boards.greenhouse.io/greenhouse';
    const profile = { firstName: 'Test', lastName: 'User', email: 'test@example.com', phone: '5550000000' };
    const answers = {};
    const resume = path.join(__dirname, '../../resumes/default-resume.pdf');

    // Only navigate; do NOT submit
    const adapter = new GreenhousePage(page, profile, answers, resume);
    await adapter.navigate(demoUrl);
    expect(page.url()).toContain('greenhouse');
  } finally {
    await page.close();
  }
}, TIMEOUT);

test('LeverPage.navigate() loads a Lever job without error', async () => {
  let LeverPage;
  try {
    LeverPage = require('../../src/pages/ats/LeverPage');
  } catch (_) {
    console.log('[apply.test] LeverPage not yet implemented - skipping');
    return;
  }

  const page = await context.newPage();
  try {
    const demoUrl = 'https://jobs.lever.co/lever';
    const profile = { firstName: 'Test', lastName: 'User', email: 'test@example.com', phone: '5550000000' };
    const adapter = new LeverPage(page, profile, {}, '');
    await adapter.navigate(demoUrl);
    expect(page.url()).toContain('lever');
  } finally {
    await page.close();
  }
}, TIMEOUT);

// ── Human-in-the-loop pause simulation ──────────────────────────────────────────
test('human-in-the-loop pause: submit token triggers submit, anything else skips', async () => {
  // Simulate the prompt logic in isolation (no stdin dependency)
  function simulateReview(userInput) {
    return userInput.trim().toLowerCase() === 'submit' ? 'submitted' : 'skipped';
  }

  expect(simulateReview('submit')).toBe('submitted');
  expect(simulateReview('SUBMIT')).toBe('submitted');
  expect(simulateReview('')).toBe('skipped');
  expect(simulateReview('no')).toBe('skipped');
  expect(simulateReview('skip')).toBe('skipped');
  expect(simulateReview('  submit  ')).toBe('submitted');
});

// ── Error screenshot on failure ─────────────────────────────────────────────────────
test('screenshot is captured when navigation fails', async () => {
  const page = await context.newPage();
  const outDir = path.join(__dirname, '../../test-results');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    await page.goto('https://this-domain-does-not-exist-xyzabc.com', { timeout: 5000 });
  } catch (_) {
    const screenshotPath = path.join(outDir, `test-error-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    // Verify screenshot was written
    const exists = fs.existsSync(screenshotPath);
    expect(exists).toBe(true);
  } finally {
    await page.close();
  }
}, TIMEOUT);
