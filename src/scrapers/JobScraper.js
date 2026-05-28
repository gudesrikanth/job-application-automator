// src/scrapers/JobScraper.js
// Master orchestrator: searches all enabled platforms AND company career pages,
// returns a deduplicated job list ready for the apply pipeline.

const LinkedInScraper = require('./platforms/LinkedInScraper');
const IndeedScraper = require('./platforms/IndeedScraper');
const GlassdoorScraper = require('./platforms/GlassdoorScraper');
const CompanyScraper = require('./CompanyScraper');
const { enrichCompanies } = require('../utils/careerPageResolver');
const searchConfig = require('../config/searchConfig.json');
const companiesConfig = require('../config/companies.json');
const fs = require('fs');
const path = require('path');

const APPLIED_CACHE_FILE = path.join(__dirname, '../../logs/applied-cache.json');

class JobScraper {
  /**
   * @param {object} page        - Playwright page
   * @param {object} options
   * @param {boolean} options.companyMode  - if true, search company career pages
   * @param {boolean} options.platformMode - if true, search LinkedIn/Indeed/Glassdoor
   */
  constructor(page, options = {}) {
    this.page = page;
    this.options = {
      companyMode: options.companyMode !== false,   // default ON
      platformMode: options.platformMode !== false  // default ON
    };

    // Platform scrapers (LinkedIn, Indeed, Glassdoor)
    this.platformScrapers = {};
    if (this.options.platformMode) {
      if (searchConfig.platforms.linkedin?.enabled) {
        this.platformScrapers.linkedin = new LinkedInScraper(page);
      }
      if (searchConfig.platforms.indeed?.enabled) {
        this.platformScrapers.indeed = new IndeedScraper(page);
      }
      if (searchConfig.platforms.glassdoor?.enabled) {
        this.platformScrapers.glassdoor = new GlassdoorScraper(page);
      }
    }

    // Company scraper (visits each company's own careers page)
    this.companyScraper = this.options.companyMode ? new CompanyScraper(page) : null;

    this.appliedCache = this._loadAppliedCache();
  }

  // ─── Cache management ────────────────────────────────────────────────────

  _loadAppliedCache() {
    try {
      if (fs.existsSync(APPLIED_CACHE_FILE)) {
        return new Set(JSON.parse(fs.readFileSync(APPLIED_CACHE_FILE, 'utf8')));
      }
    } catch (e) {
      console.warn('[JobScraper] Could not load applied cache:', e.message);
    }
    return new Set();
  }

  _saveAppliedCache() {
    try {
      const dir = path.dirname(APPLIED_CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(APPLIED_CACHE_FILE, JSON.stringify([...this.appliedCache], null, 2));
    } catch (e) {
      console.warn('[JobScraper] Could not save applied cache:', e.message);
    }
  }

  markApplied(url) {
    this.appliedCache.add(url);
    this._saveAppliedCache();
  }

  // ─── Discovery ─────────────────────────────────────────────────────────────

  /**
   * Runs discovery across all enabled modes and returns deduplicated jobs.
   */
  async discoverJobs() {
    const allJobs = [];
    const seen = new Set();

    const add = (job) => {
      if (!job.url) return;
      if (this.appliedCache.has(job.url)) {
        console.log(`  [skip - already applied] ${job.title} @ ${job.company}`);
        return;
      }
      if (seen.has(job.url)) return;
      seen.add(job.url);
      allJobs.push(job);
    };

    // ─── MODE 1: Company career pages ─────────────────────────────────────────
    if (this.options.companyMode && this.companyScraper) {
      console.log('\n[JobScraper] Phase A: Searching company career pages...');
      const { jobTitles } = searchConfig.search;

      // Enrich companies: auto-discover careersUrl for any without one
      const companies = await enrichCompanies(
        companiesConfig.companies.filter(c => c.enabled !== false),
        this.page
      );

      for (const company of companies) {
        for (const title of jobTitles) {
          const jobs = await this.companyScraper.search(company, title);
          jobs.forEach(add);
          await this._delay(1500 + Math.random() * 1500);
        }
      }
      console.log(`[JobScraper] Phase A complete. ${allJobs.length} jobs so far.`);
    }

    // ─── MODE 2: Public platforms (LinkedIn, Indeed, Glassdoor) ─────────────────
    if (this.options.platformMode && Object.keys(this.platformScrapers).length > 0) {
      console.log('\n[JobScraper] Phase B: Searching public platforms...');
      const { jobTitles, locations } = searchConfig.search;
      const maxPages = searchConfig.search.maxPagesPerSearch || 2;

      for (const title of jobTitles) {
        for (const location of locations) {
          for (const [platformName, scraper] of Object.entries(this.platformScrapers)) {
            console.log(`  [${platformName}] "${title}" in "${location}"`);
            try {
              const jobs = await scraper.search(title, location, { maxPages });
              jobs.forEach(add);
            } catch (err) {
              console.warn(`  [${platformName}] Error: ${err.message}`);
            }
            await this._delay(2000 + Math.random() * 2000);
          }
        }
      }
      console.log(`[JobScraper] Phase B complete. ${allJobs.length} total jobs.`);
    }

    console.log(`\n[JobScraper] Discovery complete: ${allJobs.length} unique jobs found.`);
    return allJobs;
  }

  // ─── Apply URL extraction ───────────────────────────────────────────────────

  async extractApplyUrl(job) {
    // Company-sourced jobs already have a direct apply URL
    if (job.source === 'company') {
      return job.url;
    }

    // Platform-sourced jobs need to navigate to the job page to find the external ATS link
    const scraper = this.platformScrapers[job.source];
    if (!scraper) return job.url || null;
    try {
      return await scraper.extractApplyUrl(job.url);
    } catch (err) {
      console.warn(`[JobScraper] Could not extract apply URL for ${job.url}: ${err.message}`);
      return null;
    }
  }

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = JobScraper;
