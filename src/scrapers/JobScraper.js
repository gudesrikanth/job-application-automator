// src/scrapers/JobScraper.js
// Master orchestrator: searches all enabled platforms and returns deduplicated job list

const LinkedInScraper = require('./platforms/LinkedInScraper');
const IndeedScraper = require('./platforms/IndeedScraper');
const GlassdoorScraper = require('./platforms/GlassdoorScraper');
const searchConfig = require('../config/searchConfig.json');
const fs = require('fs');
const path = require('path');

const APPLIED_CACHE_FILE = path.join(__dirname, '../../logs/applied-cache.json');

class JobScraper {
  constructor(page) {
    this.page = page;
    this.scrapers = {};
    if (searchConfig.platforms.linkedin && searchConfig.platforms.linkedin.enabled) {
      this.scrapers.linkedin = new LinkedInScraper(page);
    }
    if (searchConfig.platforms.indeed && searchConfig.platforms.indeed.enabled) {
      this.scrapers.indeed = new IndeedScraper(page);
    }
    if (searchConfig.platforms.glassdoor && searchConfig.platforms.glassdoor.enabled) {
      this.scrapers.glassdoor = new GlassdoorScraper(page);
    }
    this.appliedCache = this._loadAppliedCache();
  }

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

  async discoverJobs() {
    const { jobTitles, locations, filters } = searchConfig.search;
    const maxPagesPerSearch = searchConfig.search.maxPagesPerSearch || 2;
    const allJobs = [];
    const seen = new Set();

    for (const title of jobTitles) {
      for (const location of locations) {
        for (const [platformName, scraper] of Object.entries(this.scrapers)) {
          console.log(`[JobScraper] Searching ${platformName} for "${title}" in "${location}"...`);
          try {
            const jobs = await scraper.search(title, location, {
              maxPages: maxPagesPerSearch,
              ...filters
            });
            for (const job of jobs) {
              if (!job.url) continue;
              // Skip if already applied or already seen in this run
              if (this.appliedCache.has(job.url)) {
                console.log(`  [skip - already applied] ${job.title} @ ${job.company}`);
                continue;
              }
              if (seen.has(job.url)) continue;
              seen.add(job.url);
              allJobs.push(job);
            }
            console.log(`  Found ${jobs.length} jobs from ${platformName}`);
          } catch (err) {
            console.warn(`  [JobScraper] Error on ${platformName} for "${title}": ${err.message}`);
          }
          // Polite delay between platform searches
          await this._delay(2000 + Math.random() * 2000);
        }
      }
    }

    console.log(`[JobScraper] Total unique jobs discovered: ${allJobs.length}`);
    return allJobs;
  }

  async extractApplyUrl(job) {
    const scraper = this.scrapers[job.source];
    if (!scraper) return null;
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
