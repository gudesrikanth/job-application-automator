// src/scrapers/JobScraper.js
// Master orchestrator: coordinates company career-page scraping (CompanyScraper)
// and public platform scraping (LinkedIn, Indeed, Glassdoor).
// Returns a deduplicated job array for the apply pipeline.

'use strict';

const fs = require('fs');
const path = require('path');
const CompanyScraper = require('./CompanyScraper');
const LinkedInScraper = require('./platforms/LinkedInScraper');
const IndeedScraper = require('./platforms/IndeedScraper');
const GlassdoorScraper = require('./platforms/GlassdoorScraper');
const { enrich } = require('../utils/careerPageResolver');

const CACHE_FILE = path.join(__dirname, '../../logs/applied-cache.json');

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')));
    }
  } catch (_) {}
  return new Set();
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify([...cache], null, 2));
}

class JobScraper {
  /**
   * @param {object} context  - Playwright BrowserContext
   * @param {object} config   - Parsed searchConfig.json
   */
  constructor(context, config) {
    this.context = context;
    this.config = config;
    this.appliedCache = loadCache();
  }

  // ── Deduplicate and cache-filter a list of job objects ─────────────────────
  _filterNew(jobs) {
    const seen = new Set();
    return jobs.filter((job) => {
      const key = job.applyUrl || job.url || `${job.title}|${job.company}`;
      if (this.appliedCache.has(key)) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ── Mark jobs as seen (call after successful apply) ──────────────────────
  markApplied(job) {
    const key = job.applyUrl || job.url || `${job.title}|${job.company}`;
    this.appliedCache.add(key);
    saveCache(this.appliedCache);
  }

  // ── Phase 1: Company career pages ──────────────────────────────────────
  async runCompanyMode() {
    const companiesConfig = require('../config/companies.json');
    const titles = this.config.titles || [];

    // Enrich companies that are missing a careersUrl
    const companies = await enrich(companiesConfig, this.context);

    const allJobs = [];
    for (const company of companies) {
      if (!company.enabled) continue;
      if (!company.careersUrl) {
        console.warn(`[JobScraper] No careersUrl for ${company.name} - skipping`);
        continue;
      }
      try {
        const scraper = new CompanyScraper(this.context, company, titles);
        const jobs = await scraper.scrape();
        console.log(`[JobScraper] ${company.name}: found ${jobs.length} matching jobs`);
        allJobs.push(...jobs);
      } catch (err) {
        console.error(`[JobScraper] Error scraping ${company.name}: ${err.message}`);
      }
    }

    return this._filterNew(allJobs);
  }

  // ── Phase 2: Public platforms ──────────────────────────────────────────
  async runPlatformMode() {
    const { titles, locations, platforms } = this.config;
    const platformMap = {
      linkedin: LinkedInScraper,
      indeed: IndeedScraper,
      glassdoor: GlassdoorScraper,
    };

    const enabledPlatforms = Object.entries(platformMap).filter(
      ([key]) => !platforms || platforms[key] !== false
    );

    const allJobs = [];
    for (const [key, ScraperClass] of enabledPlatforms) {
      for (const title of titles) {
        for (const location of (locations || ['Remote'])) {
          try {
            console.log(`[JobScraper] Searching ${key}: "${title}" in ${location}`);
            const scraper = new ScraperClass(this.context, { title, location });
            const jobs = await scraper.search();
            allJobs.push(...jobs);
          } catch (err) {
            console.error(`[JobScraper] ${key} error for "${title}": ${err.message}`);
          }
        }
      }
    }

    return this._filterNew(allJobs);
  }
}

module.exports = JobScraper;
