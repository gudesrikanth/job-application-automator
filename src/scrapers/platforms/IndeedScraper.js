// ============================================================
// IndeedScraper.js - Scrapes Indeed job search results
// Uses public search URL, no login required
// ============================================================

import { thinkingPause, randomDelay } from '../../utils/humanize.js';

export class IndeedScraper {
  constructor(page) {
    this.page = page;
    this.platform = 'indeed';
  }

  /**
   * Search Indeed for jobs by title and location.
   * Returns array of normalized job objects.
   */
  async search(jobTitle, location = 'Remote', filters = {}) {
    const jobs = [];
    try {
      const q   = encodeURIComponent(jobTitle);
      const l   = encodeURIComponent(location);
      // fromage=7 = posted last 7 days, jt=fulltime
      const url = `https://www.indeed.com/jobs?q=${q}&l=${l}&jt=fulltime&fromage=7&sort=date`;

      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await thinkingPause(2000, 4000);

      // Handle CAPTCHA notice
      const title = await this.page.title();
      if (title.toLowerCase().includes('captcha') || title.toLowerCase().includes('blocked')) {
        console.warn('  [Indeed] Blocked by CAPTCHA - skipping');
        return jobs;
      }

      // Scroll to load cards
      for (let i = 0; i < 2; i++) {
        await this.page.evaluate(() => window.scrollBy(0, 600));
        await randomDelay(800, 1500);
      }

      // Extract job cards
      const cards = await this.page.evaluate(() => {
        const results = [];
        // Indeed uses multiple possible card selectors
        const cardEls = document.querySelectorAll(
          '[data-testid="slider_item"], .job_seen_beacon, .result, .jobsearch-SerpJobCard'
        );
        cardEls.forEach(card => {
          const titleEl   = card.querySelector('[data-testid="jobTitle"] a, h2.jobTitle a, .jobtitle a');
          const companyEl = card.querySelector('[data-testid="company-name"], .companyName, .company');
          const locationEl = card.querySelector('[data-testid="text-location"], .companyLocation, .location');

          if (titleEl) {
            const href = titleEl.href || '';
            results.push({
              title:    titleEl.textContent.trim(),
              company:  companyEl?.textContent.trim() || 'Unknown',
              location: locationEl?.textContent.trim() || '',
              url:      href.startsWith('http') ? href : `https://www.indeed.com${href}`,
            });
          }
        });
        return results.slice(0, 10);
      });

      for (const card of cards) {
        jobs.push({
          id:          `in-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          title:       card.title,
          company:     card.company,
          location:    card.location,
          url:         card.url,
          ats:         this._detectATS(card.url),
          platform:    'indeed',
          status:      'pending',
          searchTitle: jobTitle,
        });
      }

      console.log(`  [Indeed] Found ${jobs.length} jobs for "${jobTitle}"`);
    } catch (err) {
      console.warn(`  [Indeed] Search failed for "${jobTitle}": ${err.message}`);
    }
    return jobs;
  }

  /**
   * Visit an Indeed job card and extract the real external apply URL.
   * Indeed often wraps external ATS links behind an intermediate page.
   */
  async extractApplyUrl(indeedUrl) {
    try {
      await this.page.goto(indeedUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await thinkingPause(1500, 2500);

      // Look for external apply button on the job detail page
      const applyBtn = this.page.locator(
        '[data-testid="applyButtonContainerIndeed"] a, .jobsearch-IndeedApplyButton-newDesign, a[href*="greenhouse"], a[href*="lever.co"], a[href*="myworkdayjobs"]'
      ).first();

      if (await applyBtn.count() > 0) {
        const href = await applyBtn.getAttribute('href');
        return href?.startsWith('http') ? href : null;
      }
    } catch (err) {
      console.warn(`  [Indeed] Could not extract apply URL: ${err.message}`);
    }
    return null;
  }

  _detectATS(url) {
    const u = url.toLowerCase();
    if (u.includes('greenhouse.io'))   return 'greenhouse';
    if (u.includes('lever.co'))        return 'lever';
    if (u.includes('myworkdayjobs'))   return 'workday';
    if (u.includes('icims.com'))       return 'icims';
    if (u.includes('indeed.com'))      return 'indeed-apply';
    return 'unknown';
  }
}
