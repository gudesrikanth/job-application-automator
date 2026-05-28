// src/index.js
// Main orchestrator: discover jobs via company career pages AND public platforms,
// then apply using ATS adapters with human-in-the-loop review before submit.
//
// CLI flags:
//   node src/index.js                   -> run both company + platform modes
//   node src/index.js --companies-only  -> only search company career pages
//   node src/index.js --platforms-only  -> only search LinkedIn/Indeed/Glassdoor

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const JobScraper = require('./scrapers/JobScraper');
const resumeSelector = require('./utils/resumeSelector');
const GreenhousePage = require('./pages/ats/GreenhousePage');
const LeverPage = require('./pages/ats/LeverPage');
const WorkdayPage = require('./pages/ats/WorkdayPage');
const Logger = require('./utils/logger');

const profile = require('./config/profile.json');
const answers = require('./config/answers.json');
const searchConfig = require('./config/searchConfig.json');

// ─── Parse CLI args ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const companiesOnly = args.includes('--companies-only');
const platformsOnly = args.includes('--platforms-only');

const scraperOptions = {
  companyMode:  !platformsOnly,   // on unless --platforms-only
  platformMode: !companiesOnly    // on unless --companies-only
};

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
      if (!answered) { answered = true; rl.close(); console.log('[Auto-skip]'); resolve(false); }
    }, timeout * 1000);
    rl.question('> ', answer => {
      if (!answered) {
        answered = true; clearTimeout(timer); rl.close();
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
    console.warn(`  [warn] Resume PDF not found: ${resumePath}`);
  }

  console.log(`  [${ats.toUpperCase()}] ${job.title} @ ${job.company}`);
  console.log(`  Source: ${job.source} | Resume: ${resumeInfo.track}`);
  console.log(`  URL: ${applyUrl}`);

  let atsPage;
  try {
    if (ats === 'greenhouse') atsPage = new GreenhousePage(page, profile, answers, resumePath);
    else if (ats === 'lever')  atsPage = new LeverPage(page, profile, answers, resumePath);
    else if (ats === 'workday') atsPage = new WorkdayPage(page, profile, answers, resumePath);

    await atsPage.navigate(applyUrl);
    await atsPage.fillForm();

    const confirmed = await humanPause(
      `Ready to submit:\n  ${job.title} at ${job.company}\n  URL: ${applyUrl}`
    );
    if (!confirmed) { console.log('  [skipped by user]'); return { status: 'skipped', reason: 'user_skip' }; }

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
      console.log(`  Screenshot: ${ssFile}`);
    }
    Logger.logFailure(job, err);
    return { status: 'failed', error: err.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const mode = companiesOnly ? 'COMPANIES ONLY'
             : platformsOnly ? 'PLATFORMS ONLY'
             : 'FULL (Companies + Platforms)';

  console.log('\n Job Application Automator');
  console.log(`Mode: ${mode}`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({
    headless: false, slowMo: 50,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  // PHASE 1: Discover jobs
  console.log('\n[Phase 1] Discovering jobs...');
  const scraper = new JobScraper(page, scraperOptions);
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

  const maxJobs = searchConfig.behavior.maxJobsPerRun || 50;
  if (jobs.length > maxJobs) {
    console.log(`[INFO] Capping to ${maxJobs} of ${jobs.length} jobs`);
    jobs = jobs.slice(0, maxJobs);
  }
  console.log(`\n[Phase 1 Complete] ${jobs.length} jobs to process.`);

  // PHASE 2: Apply to each job
  console.log('\n[Phase 2] Applying...');
  const stats = { applied: 0, skipped: 0, failed: 0, unsupported: 0 };

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    console.log(`\n[${i + 1}/${jobs.length}] ${job.title} @ ${job.company} [${job.source}]`);
    if (job.location) console.log(`  Location: ${job.location}`);

    let applyUrl = null;
    try {
      applyUrl = await scraper.extractApplyUrl(job);
    } catch (err) {
      console.warn(`  [warn] Could not extract apply URL: ${err.message}`);
    }

    if (!applyUrl) {
      console.log('  [skip] No supported ATS apply URL found');
      stats.skipped++;
      continue;
    }

    const result = await applyToJob(page, job, applyUrl);
    if (result.status === 'applied') {
      stats.applied++;
      scraper.markApplied(job.url);
    } else if (result.status === 'skipped') {
      result.reason === 'unsupported_ats' ? stats.unsupported++ : stats.skipped++;
    } else {
      stats.failed++;
    }

    await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(' Run Summary');
  console.log('='.repeat(60));
  console.log(`  Mode:        ${mode}`);
  console.log(`  Applied:     ${stats.applied}`);
  console.log(`  Skipped:     ${stats.skipped}`);
  console.log(`  Unsupported: ${stats.unsupported}`);
  console.log(`  Failed:      ${stats.failed}`);
  console.log(`  Total:       ${jobs.length}`);
  console.log('='.repeat(60));

  await browser.close();
})();
