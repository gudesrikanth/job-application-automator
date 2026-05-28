// src/index.js
// Main orchestrator: discover jobs via search, then apply using ATS adapters
// with human-in-the-loop review before submit.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const JobScraper = require('./scrapers/JobScraper');
const resumeSelector = require('./utils/resumeSelector');
const FormFiller = require('./utils/FormFiller');
const GreenhousePage = require('./pages/ats/GreenhousePage');
const LeverPage = require('./pages/ats/LeverPage');
const WorkdayPage = require('./pages/ats/WorkdayPage');
const Logger = require('./utils/logger');

const profile = require('./config/profile.json');
const answers = require('./config/answers.json');
const searchConfig = require('./config/searchConfig.json');

// ─── Helpers ─────────────────────────────────────────────────────────────

function detectATS(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('greenhouse.io')) return 'greenhouse';
  if (u.includes('lever.co'))      return 'lever';
  if (u.includes('myworkdayjobs')) return 'workday';
  return null;
}

async function humanPause(message) {
  if (!searchConfig.behavior.pauseForReviewBeforeSubmit) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    const timeout = searchConfig.behavior.reviewTimeoutSeconds || 120;
    console.log(`\n${'='.repeat(60)}`);
    console.log(message);
    console.log(`Type "submit" to confirm, "skip" to skip, or wait ${timeout}s to auto-skip.`);
    console.log('='.repeat(60));
    let answered = false;
    const timer = setTimeout(() => {
      if (!answered) {
        answered = true;
        rl.close();
        console.log('[Auto-skip] Review timeout reached.');
        resolve(false);
      }
    }, timeout * 1000);
    rl.question('> ', (answer) => {
      if (!answered) {
        answered = true;
        clearTimeout(timer);
        rl.close();
        resolve(answer.trim().toLowerCase() === 'submit');
      }
    });
  });
}

async function applyToJob(page, job, applyUrl) {
  const ats = detectATS(applyUrl);
  if (!ats) {
    console.log(`  [skip] Unsupported ATS for URL: ${applyUrl}`);
    return { status: 'skipped', reason: 'unsupported_ats' };
  }

  const resumeInfo = resumeSelector.select(job);
  const resumePath = path.resolve(resumeInfo.pdf);
  if (!fs.existsSync(resumePath)) {
    console.warn(`  [warn] Resume PDF not found: ${resumePath} - using default`);
  }

  console.log(`  [${ats.toUpperCase()}] Applying: ${job.title} @ ${job.company}`);
  console.log(`  Resume track: ${resumeInfo.track}`);
  console.log(`  Apply URL: ${applyUrl}`);

  let atsPage;
  try {
    if (ats === 'greenhouse') {
      atsPage = new GreenhousePage(page, profile, answers, resumePath);
    } else if (ats === 'lever') {
      atsPage = new LeverPage(page, profile, answers, resumePath);
    } else if (ats === 'workday') {
      atsPage = new WorkdayPage(page, profile, answers, resumePath);
    }

    await atsPage.navigate(applyUrl);
    await atsPage.fillForm();

    // Human review pause
    const confirmed = await humanPause(
      `Ready to submit: ${job.title} at ${job.company}\nURL: ${applyUrl}`
    );

    if (!confirmed) {
      console.log('  [skipped by user]');
      return { status: 'skipped', reason: 'user_skip' };
    }

    await atsPage.submit();
    Logger.logSuccess(job);
    console.log(`  [SUCCESS] Applied to ${job.title} @ ${job.company}`);
    return { status: 'applied' };

  } catch (err) {
    console.error(`  [FAILED] ${job.title} @ ${job.company}: ${err.message}`);
    if (searchConfig.behavior.screenshotOnFailure) {
      const ssDir = path.resolve('logs/screenshots');
      if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
      const ssFile = path.join(ssDir, `failure-${Date.now()}.png`);
      await page.screenshot({ path: ssFile, fullPage: true }).catch(() => {});
      console.log(`  Screenshot saved: ${ssFile}`);
    }
    Logger.logFailure(job, err);
    return { status: 'failed', error: err.message };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n Job Application Automator - Search & Apply Pipeline');
  console.log('='.repeat(60));

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  // PHASE 1: Discover jobs via scrapers
  console.log('\n[Phase 1] Discovering jobs across platforms...');
  const scraper = new JobScraper(page);
  let jobs = [];
  try {
    jobs = await scraper.discoverJobs();
  } catch (err) {
    console.error('[ERROR] Job discovery failed:', err.message);
  }

  if (jobs.length === 0) {
    console.log('[INFO] No new jobs found. Exiting.');
    await browser.close();
    return;
  }

  // Apply the max-jobs-per-run limit
  const maxJobs = searchConfig.behavior.maxJobsPerRun || 50;
  if (jobs.length > maxJobs) {
    console.log(`[INFO] Capping job list to ${maxJobs} (found ${jobs.length})`);
    jobs = jobs.slice(0, maxJobs);
  }

  console.log(`\n[Phase 1 Complete] ${jobs.length} unique jobs to process.`);

  // PHASE 2: Extract apply URLs and route to ATS
  console.log('\n[Phase 2] Extracting apply URLs and applying...');
  const stats = { applied: 0, skipped: 0, failed: 0, unsupported: 0 };

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    console.log(`\n[${i + 1}/${jobs.length}] ${job.title} @ ${job.company} (${job.source})`);

    // Extract the external ATS apply URL
    let applyUrl = null;
    try {
      applyUrl = await scraper.extractApplyUrl(job);
    } catch (err) {
      console.warn(`  [warn] Could not extract apply URL: ${err.message}`);
    }

    if (!applyUrl) {
      console.log('  [skip] No external apply URL found (may be Easy Apply or login required)');
      stats.skipped++;
      continue;
    }

    const result = await applyToJob(page, job, applyUrl);

    if (result.status === 'applied') {
      stats.applied++;
      scraper.markApplied(job.url); // persist to cache to avoid re-applying
    } else if (result.status === 'skipped') {
      if (result.reason === 'unsupported_ats') stats.unsupported++;
      else stats.skipped++;
    } else {
      stats.failed++;
    }

    // Polite delay between applications
    const delay = 3000 + Math.random() * 3000;
    await new Promise(r => setTimeout(r, delay));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(' Run Summary');
  console.log('='.repeat(60));
  console.log(`  Applied:     ${stats.applied}`);
  console.log(`  Skipped:     ${stats.skipped}`);
  console.log(`  Unsupported: ${stats.unsupported}`);
  console.log(`  Failed:      ${stats.failed}`);
  console.log(`  Total:       ${jobs.length}`);
  console.log('='.repeat(60));

  await browser.close();
})();
