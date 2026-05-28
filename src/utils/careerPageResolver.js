// src/utils/careerPageResolver.js
// Auto-discovers a company's careers page URL when one isn't explicitly configured.
// Strategy: try common career URL patterns, then fall back to a web search.

const https = require('https');
const http = require('http');

// Common career page URL patterns to try for a given domain
const CAREER_PATH_PATTERNS = [
  'careers',
  'jobs',
  'career',
  'work-with-us',
  'join-us',
  'join-our-team',
  'opportunities',
  'open-positions'
];

// Common career subdomain patterns
const CAREER_SUBDOMAIN_PATTERNS = [
  'careers',
  'jobs',
  'career',
  'hire',
  'apply'
];

/**
 * Given a company name or domain, attempt to resolve the careers page URL.
 * @param {string} companyName  - e.g. "Stripe" or "stripe.com"
 * @param {object} page         - Playwright page (used for browser-based resolution)
 * @returns {Promise<string|null>} - resolved careers URL or null
 */
async function resolveCareerUrl(companyName, page) {
  // 1. Derive a base domain guess from the company name
  const domain = companyName.includes('.')
    ? companyName
    : `${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

  // 2. Try common subdomains first (careers.company.com)
  for (const sub of CAREER_SUBDOMAIN_PATTERNS) {
    const url = `https://${sub}.${domain}`;
    if (await _urlReachable(url)) {
      console.log(`[careerPageResolver] Found via subdomain: ${url}`);
      return url;
    }
  }

  // 3. Try common paths on the main domain (company.com/careers)
  for (const pathSuffix of CAREER_PATH_PATTERNS) {
    const url = `https://www.${domain}/${pathSuffix}`;
    if (await _urlReachable(url)) {
      console.log(`[careerPageResolver] Found via path: ${url}`);
      return url;
    }
  }

  // 4. Fallback: use the browser to do a DuckDuckGo search and grab the first result
  if (page) {
    const searchResult = await _browserSearch(page, `${companyName} careers jobs site`);
    if (searchResult) {
      console.log(`[careerPageResolver] Found via browser search: ${searchResult}`);
      return searchResult;
    }
  }

  console.warn(`[careerPageResolver] Could not resolve career page for: ${companyName}`);
  return null;
}

/**
 * Quick HTTP HEAD check to see if a URL is reachable (returns 200-399).
 */
function _urlReachable(url) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method: 'HEAD', timeout: 5000 }, res => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Use the Playwright browser to search DuckDuckGo and return the first result URL.
 */
async function _browserSearch(page, query) {
  try {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    // Grab first organic result link
    const firstResult = await page.locator('a[data-testid="result-title-a"]').first();
    if (await firstResult.count() > 0) {
      const href = await firstResult.getAttribute('href');
      if (href && href.startsWith('http')) return href;
    }
  } catch (_) {}
  return null;
}

/**
 * Enrich a companies array: fill in missing careersUrl via resolution.
 * @param {Array}  companies - from companies.json
 * @param {object} page      - Playwright page
 * @returns {Promise<Array>}
 */
async function enrichCompanies(companies, page) {
  const enriched = [];
  for (const company of companies) {
    if (!company.enabled) continue;
    if (!company.careersUrl) {
      console.log(`[careerPageResolver] Resolving career URL for: ${company.name}`);
      company.careersUrl = await resolveCareerUrl(company.name, page);
    }
    if (company.careersUrl) {
      enriched.push(company);
    } else {
      console.warn(`[careerPageResolver] Skipping ${company.name} - no career URL found`);
    }
  }
  return enriched;
}

module.exports = { resolveCareerUrl, enrichCompanies };
