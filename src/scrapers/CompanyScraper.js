// src/scrapers/CompanyScraper.js
// Visits a company's own careers page, filters by target job titles,
// and returns structured job objects ready for the apply pipeline.

'use strict';

class CompanyScraper {
  /**
   * @param {object} context  - Playwright BrowserContext
   * @param {object} company  - Entry from companies.json
   *   { name, careersUrl, ats, searchParam, listingSelector, titleSelector, linkSelector }
   * @param {string[]} titles - Job titles to match (from searchConfig.json)
   */
  constructor(context, company, titles) {
    this.context = context;
    this.company = company;
    this.titles = titles.map((t) => t.toLowerCase());
  }

  // ── Main entry point ──────────────────────────────────────────────────────────────
  async scrape() {
    const { name, careersUrl, ats } = this.company;
    const page = await this.context.newPage();
    const jobs = [];

    try {
      console.log(`[CompanyScraper] Visiting ${name}: ${careersUrl}`);
      await page.goto(careersUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Try each target title as a search query
      for (const title of this.titles) {
        try {
          const found = await this._searchTitle(page, title);
          jobs.push(...found);
        } catch (err) {
          console.warn(`[CompanyScraper] ${name} - error searching "${title}": ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`[CompanyScraper] Failed to load ${careersUrl}: ${err.message}`);
    } finally {
      await page.close();
    }

    // Deduplicate within this company
    const seen = new Set();
    return jobs.filter((j) => {
      if (seen.has(j.url)) return false;
      seen.add(j.url);
      return true;
    });
  }

  // ── Search for a single title on the careers page ────────────────────────────
  async _searchTitle(page, title) {
    const { name, careersUrl, searchParam, ats } = this.company;

    // Strategy 1: URL search param (e.g. ?q=data+analyst)
    if (searchParam) {
      const sep = careersUrl.includes('?') ? '&' : '?';
      const searchUrl = `${careersUrl}${sep}${searchParam}=${encodeURIComponent(title)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
    }

    // Strategy 2: Try to find a search input and type into it
    else {
      const searchInput = await page.$(
        'input[type="search"], input[placeholder*="search" i], input[placeholder*="job" i], input[aria-label*="search" i]'
      );
      if (searchInput) {
        await searchInput.click({ clickCount: 3 });
        await searchInput.type(title, { delay: 80 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    }

    // Extract job listings
    return await this._extractJobs(page, title);
  }

  // ── Extract job listings from the current page ───────────────────────────────
  async _extractJobs(page, searchTitle) {
    const { name, ats, listingSelector, titleSelector, linkSelector } = this.company;

    // Default selectors by ATS
    const defaults = {
      greenhouse: {
        listing: '.opening',
        titleEl: '.opening a',
        linkEl: '.opening a',
      },
      lever: {
        listing: '.posting',
        titleEl: '.posting-title h5',
        linkEl: '.posting-title',
      },
      workday: {
        listing: '[data-automation-id="jobPostingsList"] li',
        titleEl: '[data-automation-id="jobPostingTitle"]',
        linkEl: 'a',
      },
      generic: {
        listing: 'li, article, .job, .job-listing, .position',
        titleEl: 'h2, h3, h4, a',
        linkEl: 'a',
      },
    };

    const sel = defaults[ats] || defaults.generic;
    const listingSel = listingSelector || sel.listing;
    const titleSel = titleSelector || sel.titleEl;
    const linkSel = linkSelector || sel.linkEl;

    const jobs = [];
    try {
      await page.waitForSelector(listingSel, { timeout: 8000 });
    } catch (_) {
      // No listings found with selector - return empty
      return jobs;
    }

    const listings = await page.$$(listingSel);
    for (const el of listings) {
      try {
        const titleText = await el.$eval(titleSel, (n) => n.textContent.trim()).catch(() => '');
        const href = await el.$eval(linkSel, (n) => n.href).catch(() => '');

        if (!titleText) continue;

        // Filter: only include if title matches one of our target titles
        const titleLower = titleText.toLowerCase();
        const isMatch = this.titles.some((t) => titleLower.includes(t));
        if (!isMatch) continue;

        jobs.push({
          title: titleText,
          company: name,
          url: href || page.url(),
          applyUrl: href || page.url(),
          source: 'company-page',
          ats: ats || 'unknown',
        });
      } catch (_) {}
    }

    return jobs;
  }
}

module.exports = CompanyScraper;
