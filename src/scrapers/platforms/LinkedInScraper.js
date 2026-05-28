// ============================================================
// LinkedInScraper.js - Scrapes LinkedIn Jobs search results
// Searches by title + location, extracts job cards with ATS URLs
// ============================================================

import { thinkingPause, randomDelay, humanClick, humanType } from '../../utils/humanize.js';

export class LinkedInScraper {
  constructor(page) {
    this.page = page;
    this.platform = 'linkedin';
  }

  /**
   * Search LinkedIn for jobs by title and location.
   * Returns array of job objects: { title, company, url, location, ats }
   */
  async search(jobTitle, location = 'Remote', filters = {}) {
    const jobs = [];
    try {
      const query = encodeURIComponent(jobTitle);
      const loc   = encodeURIComponent(location);

      // f_TPR=r604800 = posted in last 7 days
      // f_JT=F = full-time
      // f_WT=2 = remote
      let url = `https://www.linkedin.com/jobs/search?keywords=${query}&location=${loc}&f_JT=F&f_TPR=r604800&sortBy=DD`;
      if (filters.remote) url += '&f_WT=2';

      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await thinkingPause(2000, 4000);

      // Handle login wall if present
      const loginPrompt = this.page.locator('.authwall-join-form, [data-test-id="join-form"]');
      if (await loginPrompt.count() > 0) {
        console.log('  [LinkedIn] Login wall detected - using public results');
        // Try the public jobs page instead
        const pubUrl = `https://www.linkedin.com/jobs/search?keywords=${query}&location=${loc}&f_JT=F`;
        await this.page.goto(pubUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await thinkingPause(2000, 3000);
      }

      // Dismiss sign-in modal if present
      const dismissBtn = this.page.locator('button[data-tracking-control-name="public_jobs_nav-header-signin"], .modal__dismiss, [aria-label="Dismiss"]').first();
      if (await dismissBtn.count() > 0) {
        await humanClick(this.page, dismissBtn);
        await randomDelay(500, 1000);
      }

      // Wait for job cards
      await this.page.waitForSelector(
        '.job-search-card, .jobs-search__results-list li, .base-card',
        { timeout: 15000 }
      ).catch(() => console.log('  [LinkedIn] Job cards not found - page may require login'));

      // Scroll to load more results
      for (let i = 0; i < 3; i++) {
        await this.page.evaluate(() => window.scrollBy(0, 800));
        await randomDelay(800, 1500);
      }

      // Extract job cards
      const cards = await this.page.evaluate(() => {
        const results = [];
        const cardEls = document.querySelectorAll(
          '.job-search-card, .base-card, .jobs-search__results-list li'
        );
        cardEls.forEach(card => {
          const titleEl   = card.querySelector('.base-search-card__title, h3.job-search-card__title, h3');
          const companyEl = card.querySelector('.base-search-card__subtitle, h4, .job-search-card__company-name');
          const locationEl = card.querySelector('.job-search-card__location, .base-search-card__metadata');
          const linkEl    = card.querySelector('a.base-card__full-link, a[href*="/jobs/view/"]');

          if (titleEl && linkEl) {
            results.push({
              title:    titleEl.textContent.trim(),
              company:  companyEl?.textContent.trim() || 'Unknown',
              location: locationEl?.textContent.trim() || '',
              url:      linkEl.href.split('?')[0],
            });
          }
        });
        return results.slice(0, 10);
      });

      for (const card of cards) {
        const ats = this._detectATS(card.url);
        jobs.push({
          id:       `li-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          title:    card.title,
          company:  card.company,
          location: card.location,
          url:      card.url,
          ats:      ats,
          platform: 'linkedin',
          status:   'pending',
          searchTitle: jobTitle,
        });
      }

      console.log(`  [LinkedIn] Found ${jobs.length} jobs for "${jobTitle}"`);
    } catch (err) {
      console.warn(`  [LinkedIn] Search failed for "${jobTitle}": ${err.message}`);
    }
    return jobs;
  }

  /**
   * Detect ATS platform from the job detail page URL.
   * Visits the job posting and looks for redirect to known ATS.
   */
  _detectATS(url) {
    const u = url.toLowerCase();
    if (u.includes('greenhouse.io'))    return 'greenhouse';
    if (u.includes('lever.co'))         return 'lever';
    if (u.includes('myworkdayjobs'))    return 'workday';
    if (u.includes('icims.com'))        return 'icims';
    if (u.includes('smartrecruiters')) return 'smartrecruiters';
    if (u.includes('taleo'))           return 'taleo';
    // LinkedIn easy apply or unknown
    return 'linkedin-easy-apply';
  }

  /**
   * Visit a LinkedIn job posting and extract the actual ATS application URL.
   * Returns the external apply URL if found, or null for Easy Apply jobs.
   */
  async extractApplyUrl(jobUrl) {
    try {
      await this.page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await thinkingPause(1500, 3000);

      // Look for external apply button
      const externalBtn = this.page.locator(
        'a.apply-button[href*="http"], a[data-tracking-control-name*="applybutton"], .jobs-apply-button--top-card a'
      ).first();

      if (await externalBtn.count() > 0) {
        const href = await externalBtn.getAttribute('href');
        return href;
      }

      // Check if it's Easy Apply
      const easyApply = this.page.locator('button.jobs-apply-button, .jobs-apply-button--top-card button').first();
      if (await easyApply.count() > 0) {
        return null; // Easy Apply - not supported yet
      }
    } catch (err) {
      console.warn(`  [LinkedIn] Could not extract apply URL: ${err.message}`);
    }
    return null;
  }
}
