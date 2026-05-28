// src/utils/careerPageResolver.js
// Auto-discovers a company's careers page URL when one isn't explicitly provided.
// Strategies (in order):
//   1. Try common URL path patterns on the company domain
//   2. Follow the company homepage and look for a careers/jobs link
// Exports:
//   resolve(company) -> string|null  (careersUrl or null)
//   enrich(companies, context) -> enriched companies array

'use strict';

const CAREER_PATHS = [
  '/careers',
  '/jobs',
  '/career',
  '/work-with-us',
  '/join-us',
  '/join-our-team',
  '/opportunities',
  '/open-positions',
  '/about/careers',
];

const CAREER_LINK_PATTERNS = [
  /careers/i,
  /jobs/i,
  /join.us/i,
  /work.with.us/i,
  /opportunities/i,
  /open.positions/i,
];

/**
 * Probe common URL paths on the company domain.
 * Returns the first URL that responds with 200, or null.
 * @param {object} context  - Playwright BrowserContext
 * @param {string} domain   - e.g. "stripe.com"
 */
async function probeCommonPaths(context, domain) {
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const page = await context.newPage();
  try {
    for (const p of CAREER_PATHS) {
      const url = base.replace(/\/$/, '') + p;
      try {
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        if (resp && resp.status() < 400) {
          console.log(`[resolver] Found careers URL via path probe: ${url}`);
          return url;
        }
      } catch (_) {}
    }
  } finally {
    await page.close();
  }
  return null;
}

/**
 * Visit the company homepage and look for a link that contains careers/jobs text.
 * @param {object} context  - Playwright BrowserContext
 * @param {string} domain   - e.g. "stripe.com"
 */
async function followHomepageLink(context, domain) {
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const page = await context.newPage();
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const links = await page.$$eval('a[href]', (els) =>
      els.map((el) => ({ href: el.href, text: el.textContent.trim() }))
    );
    for (const { href, text } of links) {
      for (const pattern of CAREER_LINK_PATTERNS) {
        if (pattern.test(text) || pattern.test(href)) {
          console.log(`[resolver] Found careers link on homepage: ${href}`);
          return href;
        }
      }
    }
  } catch (err) {
    console.warn(`[resolver] Could not load homepage ${base}: ${err.message}`);
  } finally {
    await page.close();
  }
  return null;
}

/**
 * Resolve the careers URL for a single company entry.
 * @param {object} company  - { name, domain, careersUrl?, ... }
 * @param {object} context  - Playwright BrowserContext
 * @returns {string|null}
 */
async function resolve(company, context) {
  if (company.careersUrl) return company.careersUrl; // already known
  if (!company.domain) return null;

  // Try common URL paths first (faster)
  const byPath = await probeCommonPaths(context, company.domain);
  if (byPath) return byPath;

  // Fall back to homepage link discovery
  const byLink = await followHomepageLink(context, company.domain);
  return byLink;
}

/**
 * Enrich an array of company configs by resolving any missing careersUrl.
 * @param {object[]} companies  - Array of company config objects
 * @param {object}   context    - Playwright BrowserContext
 * @returns {object[]}          - Companies with careersUrl populated where possible
 */
async function enrich(companies, context) {
  const result = [];
  for (const company of companies) {
    if (!company.careersUrl && company.domain) {
      console.log(`[resolver] Resolving careers URL for ${company.name}...`);
      const url = await resolve(company, context);
      result.push({ ...company, careersUrl: url || company.careersUrl || null });
    } else {
      result.push(company);
    }
  }
  return result;
}

module.exports = { resolve, enrich, probeCommonPaths, followHomepageLink };
