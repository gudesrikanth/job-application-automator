// ============================================================
// logger.js - Centralized error and event logging
// Writes JSON log entries and captures screenshots on failure
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../../logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOG_DIR, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const log = [];

/**
 * Log a successful application event.
 */
export function logSuccess(job) {
  const entry = {
    status: 'success',
    jobId: job.id,
    title: job.title,
    company: job.company,
    ats: job.ats,
    url: job.url,
    timestamp: new Date().toISOString(),
  };
  log.push(entry);
  _flush();
  console.log(`  [Logger] SUCCESS: ${job.title} @ ${job.company}`);
}

/**
 * Log a failed application with error details and optional screenshot.
 */
export async function logFailure(job, error, page = null) {
  const screenshotPath = await _captureScreenshot(job, page);
  const entry = {
    status: 'failure',
    jobId: job.id,
    title: job.title,
    company: job.company,
    ats: job.ats,
    url: job.url,
    error: error?.message || String(error),
    stack: error?.stack || null,
    screenshot: screenshotPath,
    timestamp: new Date().toISOString(),
  };
  log.push(entry);
  _flush();
  console.error(`  [Logger] FAILURE: ${job.title} @ ${job.company} - ${error?.message}`);
  if (screenshotPath) {
    console.error(`  [Logger] Screenshot saved: ${screenshotPath}`);
  }
}

/**
 * Log a skipped application.
 */
export function logSkipped(job, reason) {
  const entry = {
    status: 'skipped',
    jobId: job.id,
    title: job.title,
    company: job.company,
    reason,
    timestamp: new Date().toISOString(),
  };
  log.push(entry);
  _flush();
  console.log(`  [Logger] SKIPPED: ${job.title} @ ${job.company} - ${reason}`);
}

/**
 * Print a summary of the run to console.
 */
export function printSummary() {
  const success = log.filter(e => e.status === 'success').length;
  const failure = log.filter(e => e.status === 'failure').length;
  const skipped = log.filter(e => e.status === 'skipped').length;
  console.log('\n  ==============================');
  console.log('  RUN SUMMARY');
  console.log(`  Success: ${success}`);
  console.log(`  Failed:  ${failure}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Log:     ${LOG_FILE}`);
  console.log('  ==============================\n');
}

// Internal: capture a screenshot to the logs directory
async function _captureScreenshot(job, page) {
  if (!page) return null;
  try {
    const fileName = `failure-${job.id}-${Date.now()}.png`;
    const filePath = path.join(LOG_DIR, fileName);
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch {
    return null;
  }
}

// Internal: write log array to JSON file
function _flush() {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
  } catch (err) {
    console.error('  [Logger] Failed to write log:', err.message);
  }
}
