// src/index.js
// Main orchestrator: discover jobs via company career pages AND public platforms,
// then apply using ATS adapters with human-in-the-loop review before submit.
//
// CLI flags:
//   node src/index.js                 -> run both company + platform modes
//   node src/index.js --companies-only -> only search company career pages
//   node src/index.js --platforms-only -> only search LinkedIn/Indeed/Glassdoor

'use strict';

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

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const companiesOnly = args.includes('--companies-only');
const platformsOnly = args.includes('--platforms-only');

// ── ATS adapter map ─────────────────────────────────────────────────────────
const ATS_ADAPTERS = {
  greenhouse: GreenhousePage,
  lever: LeverPage,
  workday: WorkdayPage,
};

// ── Human-in-the-loop helper ────────────────────────────────────────────────
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── Detect ATS from URL ──────────────────────────────────────────────────────
function detectATS(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('greenhouse.io') || u.includes('boards.greenhouse')) return 'greenhouse';
  if (u.includes('lever.co') || u.includes('jobs.lever')) return 'lever';
  if (u.includes('myworkdayjobs') || u.includes('workday')) return 'workday';
  return null;
};

// ── Apply to a single job listing ────────────────────────────────────────────
async function applyToJob(context, job) {
  const atsKey = detectATS(job.applyUrl || job.url);
  const AdapterClass = atsKey ? ATS_ADAPTERS[atsKey] : null;

  if (!AdapterClass) {
    Logger.warn(`[apply] No ATS adapter for: ${job.applyUrl || job.url}`);
    return { status: 'skipped', reason: 'no-adapter' };
  }

  const resume = resumeSelector.select(job, searchConfig.tracks);
  const page = await context.newPage();

  try {
    const adapter = new AdapterClass(page, profile, answers, resume);
    await adapter.navigate(job.applyUrl || job.url);
    await adapter.fillForm();

    // ── Human-in-the-loop review pause ───────────────────────────────────
    console.log('\n' + '═'.repeat(60));
    console.log(`[REVIEW] Job: ${job.title} @ ${job.company}`);
    console.log(`[REVIEW] URL: ${job.applyUrl || job.url}`);
    console.log('[REVIEW] Form is filled. Type "submit" to submit, or Enter to skip.');
    const answer = await prompt('> ');

    if (answer === 'submit') {
      await adapter.submit();
      Logger.log(`[apply] Submitted: ${job.title} @ ${job.company}`);
      return { status: 'submitted' };
    } else {
      Logger.log(`[apply] Skipped by user: ${job.title} @ ${job.company}`);
      return { status: 'skipped', reason: 'user-skip' };
    }
  } catch (err) {
    Logger.error(`[apply] Error applying to ${job.title}: ${err.message}`);
    await page.screenshot({
      path: `test-results/error-${Date.now()}.png`,
      fullPage: true,
    }).catch(() => {});
    return { status: 'error', reason: err.message };
  } finally {
    await page.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({
    headless: searchConfig.behavior.headless,
    slowMo: searchConfig.behavior.slowMo || 50,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  // Ensure output dirs exist
  fs.mkdirSync('test-results', { recursive: true });
  fs.mkdirSync('logs', { recursive: true });

  try {
    const scraper = new JobScraper(context, searchConfig);
    let jobs = [];

    if (!platformsOnly) {
      console.log('\n[main] === Phase 1: Company career-page discovery ===');
      const companyJobs = await scraper.runCompanyMode();
      jobs = jobs.concat(companyJobs);
      console.log(`[main] Found ${companyJobs.length} jobs from company pages.`);
    }

    if (!companiesOnly) {
      console.log('\n[main] === Phase 2: Public platform discovery ===');
      const platformJobs = await scraper.runPlatformMode();
      jobs = jobs.concat(platformJobs);
      console.log(`[main] Found ${platformJobs.length} jobs from platforms.`);
    }

    // Deduplicate by URL
    const seen = new Set();
    const uniqueJobs = jobs.filter((j) => {
      const key = j.applyUrl || j.url || `${j.title}|${j.company}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`\n[main] Total unique jobs to process: ${uniqueJobs.length}`);

    // Apply
    const results = { submitted: 0, skipped: 0, error: 0 };
    for (const job of uniqueJobs) {
      const result = await applyToJob(context, job);
      results[result.status] = (results[result.status] || 0) + 1;
    }

    console.log('\n[main] === Run Complete ===');
    console.log(`  Submitted : ${results.submitted}`);
    console.log(`  Skipped   : ${results.skipped}`);
    console.log(`  Errors    : ${results.error}`);

    // Write summary log
    const summary = { timestamp: new Date().toISOString(), jobs: uniqueJobs, results };
    fs.writeFileSync(
      `logs/run-${Date.now()}.json`,
      JSON.stringify(summary, null, 2)
    );
  } catch (err) {
    console.error('[main] Fatal error:', err.message);
    process.exit(1);
  } finally {
    await context.close();
    await browser.close();
  }
}

main();
