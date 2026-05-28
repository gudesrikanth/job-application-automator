// ============================================================
// index.js - Main pipeline orchestrator
// Loads config, launches browser, routes each job to the
// correct ATS adapter, and logs results.
// ============================================================

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { GreenhousePage } from './pages/ats/GreenhousePage.js';
import { LeverPage } from './pages/ats/LeverPage.js';
import { WorkdayPage } from './pages/ats/WorkdayPage.js';
import { resolveResume } from './utils/resumeSelector.js';
import { logSuccess, logFailure, logSkipped, printSummary } from './core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Load config files ----
function loadJSON(relPath) {
  return JSON.parse(readFileSync(path.resolve(__dirname, relPath), 'utf8'));
}

const profile = loadJSON('./config/profile.json');
const answers = loadJSON('./config/answers.json');
const jobs    = loadJSON('./config/jobs.json');

// ---- ATS Router ----
function getATSPage(atsName, page) {
  switch (atsName?.toLowerCase()) {
    case 'greenhouse': return new GreenhousePage(page);
    case 'lever':      return new LeverPage(page);
    case 'workday':    return new WorkdayPage(page);
    default:
      throw new Error(`Unknown ATS: ${atsName}. Supported: greenhouse, lever, workday`);
  }
}

// ---- Main pipeline ----
async function run() {
  console.log('\n  Job Application Automator - Starting...');
  console.log(`  Profile: ${profile.personal.fullName}`);
  console.log(`  Jobs to process: ${jobs.length}\n`);

  // Launch Playwright browser - headful so you can review
  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,  // Slight slow-down for more human-like timing
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--start-maximized',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    // Mask automation fingerprint
    javaScriptEnabled: true,
    locale: 'en-US',
    timezoneId: 'America/Chicago',
  });

  // Mask webdriver flag to bypass basic bot detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  for (const job of jobs) {
    // Skip already completed jobs
    if (job.status === 'applied' || job.status === 'skip') {
      logSkipped(job, `Status is '${job.status}'`);
      continue;
    }

    // Skip jobs without a URL
    if (!job.url) {
      logSkipped(job, 'No URL provided');
      continue;
    }

    console.log(`\n  Processing: ${job.title} @ ${job.company} [${job.ats}]`);

    const page = await context.newPage();

    try {
      // Resolve the right resume for this job
      const { track, resumePath } = resolveResume(job);
      console.log(`  Resume track: ${track}`);
      console.log(`  Resume file:  ${resumePath}`);

      // Get ATS page object
      const atsPage = getATSPage(job.ats, page);

      // Run the full application flow
      await atsPage.apply(job, profile, answers, resumePath);

      logSuccess(job);
    } catch (err) {
      await logFailure(job, err, page);
    } finally {
      // Keep page open briefly for review, then close
      await page.waitForTimeout(3000);
      await page.close();
    }
  }

  await browser.close();
  printSummary();
}

run().catch((err) => {
  console.error('  Fatal error:', err);
  process.exit(1);
});
