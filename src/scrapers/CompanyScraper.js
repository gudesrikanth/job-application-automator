// src/scrapers/CompanyScraper.js
// Visits a company's own careers page, searches by job title,
// extracts matching job listings, and returns structured job objects.

const { randomDelay, humanClick } = require('../utils/humanize');

class CompanyScraper {
  constructor(page) {
    this.page = page;
  }

  /**
   * Main entry: search a company careers page for a specific job title.
   * @param {object} company  - entry from companies.json
   * @param {string} title    - job title to search
   * @returns {Array}         - array of job objects { title, company, url, source, ats }
   */
  async search(company, title) {
    const jobs = [];
    try {
      console.log(`  [CompanyScraper] ${company.name} -> "${title}"`);
      await this.page.goto(company.careersUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(this.page, 1500, 3000);

      // Try to find and fill a search box
      const filled = await this._fillSearchBox(company, title);
      if (!filled) {
        // Fallback: append search term as URL query param
        const searchUrl = this._buildSearchUrl(company, title);
        await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(this.page, 2000, 4000);
      }

      // Dismiss any modals/cookie banners
      await this._dismissModals();

      // Extract job listings from the results page
      const extracted = await this._extractListings(company);
      for (const job of extracted) {
        // Filter by title relevance
        if (this._titleMatches(job.title, title)) {
          jobs.push({
            title: job.title,
            company: company.name,
            url: job.url,
            source: 'company',
            ats: company.ats || this._detectATS(job.url),
            location: job.location || 'Not specified'
          });
        }
      }
      console.log(`    Found ${jobs.length} matching jobs at ${company.name}`);
    } catch (err) {
      console.warn(`  [CompanyScraper] Error scraping ${company.name}: ${err.message}`);
    }
    return jobs;
  }

  /**
   * Try to locate and type into a search input on the careers page.
   */
  async _fillSearchBox(company, title) {
    const searchSelectors = [
      `input[name="${company.searchParam}"]`,
      'input[type="search"]',
      'input[placeholder*="Search" i]',
      'input[placeholder*="Job title" i]',
      'input[placeholder*="Role" i]',
      'input[aria-label*="Search" i]',
      'input[id*="search" i]',
      'input[class*="search" i]',
      '[data-testid*="search"] input',
      '.search-bar input',
      '#keyword',
      '#searchKeyword',
      '#jobSearch'
    ];

    for (const selector of searchSelectors) {
      try {
        const el = this.page.locator(selector).first();
        if (await el.count() > 0 && await el.isVisible()) {
          await el.clear();
          await el.type(title, { delay: 80 + Math.random() * 60 });
          await randomDelay(this.page, 300, 600);
          // Press Enter or click search button
          await el.press('Enter');
          await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
          await randomDelay(this.page, 2000, 4000);
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  /**
   * Build a search URL using the company's configured searchParam.
   */
  _buildSearchUrl(company, title) {
    const base = company.careersUrl;
    const param = company.searchParam || 'q';
    const encoded = encodeURIComponent(title);
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}${param}=${encoded}`;
  }

  /**
   * Extract job listings from common career page structures.
   */
  async _extractListings(company) {
    const jobs = [];

    // Common job listing link patterns across career portals
    const linkSelectors = [
      'a[href*="/jobs/"]',
      'a[href*="/job/"]',
      'a[href*="/careers/"]',
      'a[href*="/position/"]',
      'a[href*="/opening/"]',
      'a[href*="/requisition/"]',
      'a[href*="greenhouse.io"]',
      'a[href*="lever.co"]',
      'a[href*="myworkdayjobs"]',
      '[data-testid*="job"] a',
      '.job-listing a',
      '.job-result a',
      '.job-card a',
      '.job-title a',
      'li.job a',
      'tr.job-row a',
      '.careers-job a',
      'h2 a',
      'h3 a'
    ];

    // Try each selector and collect links
    const seen = new Set();
    for (const selector of linkSelectors) {
      try {
        const elements = await this.page.locator(selector).all();
        for (const el of elements.slice(0, 50)) {
          try {
            const href = await el.getAttribute('href');
            const text = (await el.innerText()).trim();
            if (!href || !text || text.length < 3) continue;
            const fullUrl = href.startsWith('http') ? href : new URL(href, this.page.url()).href;
            if (seen.has(fullUrl)) continue;
            seen.add(fullUrl);
            // Extract location if present in parent
            let location = '';
            try {
              const parent = el.locator('xpath=ancestor::li[1]').or(el.locator('xpath=ancestor::div[2]'));
              const parentText = await parent.first().innerText().catch(() => '');
              const locMatch = parentText.match(/([A-Z][a-z]+(?:,?\s[A-Z]{2})?|Remote|Hybrid)/g);
              if (locMatch) location = locMatch[0];
            } catch (_) {}
            jobs.push({ title: text, url: fullUrl, location });
          } catch (_) {}
        }
        if (jobs.length > 0) break; // stop at first successful selector
      } catch (_) {}
    }

    // Fallback: look for structured JSON-LD data (some modern career sites use it)
    if (jobs.length === 0) {
      jobs.push(...await this._extractJsonLd());
    }

    return jobs;
  }

  /**
   * Parse JSON-LD JobPosting schema from the page (common in modern career sites).
   */
  async _extractJsonLd() {
    try {
      const jsonLdBlocks = await this.page.$$eval(
        'script[type="application/ld+json"]',
        scripts => scripts.map(s => {
          try { return JSON.parse(s.textContent); } catch { return null; }
        }).filter(Boolean)
      );
      const jobs = [];
      for (const block of jsonLdBlocks) {
        const items = Array.isArray(block) ? block : [block];
        for (const item of items) {
          if (item['@type'] === 'JobPosting') {
            jobs.push({
              title: item.title || '',
              url: item.url || item.sameAs || this.page.url(),
              location: item.jobLocation?.address?.addressLocality || ''
            });
          }
        }
      }
      return jobs;
    } catch (_) {
      return [];
    }
  }

  /**
   * Check if a job title is relevant to the search term.
   */
  _titleMatches(jobTitle, searchTitle) {
    if (!jobTitle) return false;
    const jt = jobTitle.toLowerCase();
    const st = searchTitle.toLowerCase();
    // Exact or contains match
    if (jt.includes(st)) return true;
    // Word-level partial match (e.g. "Software" matches "Software Engineer")
    const words = st.split(' ').filter(w => w.length > 3);
    return words.some(w => jt.includes(w));
  }

  /**
   * Detect ATS platform from a job URL.
   */
  _detectATS(url) {
    if (!url) return null;
    const u = url.toLowerCase();
    if (u.includes('greenhouse.io')) return 'greenhouse';
    if (u.includes('lever.co'))      return 'lever';
    if (u.includes('myworkdayjobs')) return 'workday';
    if (u.includes('jobvite'))       return 'jobvite';
    if (u.includes('icims'))         return 'icims';
    return 'custom';
  }

  /**
   * Dismiss common modals: cookie banners, newsletter popups, login walls.
   */
  async _dismissModals() {
    const dismissSelectors = [
      'button[aria-label*="Close" i]',
      'button[aria-label*="Dismiss" i]',
      'button[aria-label*="Accept" i]',
      'button[class*="close" i]',
      'button[id*="close" i]',
      '[data-testid*="close"]',
      '.modal-close',
      '.cookie-accept',
      '#onetrust-accept-btn-handler',
      '.cc-btn.cc-allow'
    ];
    for (const sel of dismissSelectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.count() > 0 && await el.isVisible()) {
          await el.click({ timeout: 3000 });
          await randomDelay(this.page, 300, 600);
        }
      } catch (_) {}
    }
  }
}

module.exports = CompanyScraper;
