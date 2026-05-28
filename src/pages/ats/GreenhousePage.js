// ============================================================
// GreenhousePage.js - POM adapter for Greenhouse ATS
// Handles boards.greenhouse.io application forms
// ============================================================

import { FormFiller } from '../components/FormFiller.js';
import { humanClick, thinkingPause, randomDelay } from '../../utils/humanize.js';

export class GreenhousePage {
  constructor(page) {
    this.page = page;
    this.filler = new FormFiller(page);
  }

  // Navigate to the job posting URL
  async open(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await thinkingPause(1000, 2500);
    console.log('  [Greenhouse] Opened job URL');
  }

  // Click the main Apply button to open the application form
  async clickApply() {
    const applyBtn = this.page.locator('#apply_button, a:has-text("Apply"), button:has-text("Apply for this job")').first();
    await applyBtn.waitFor({ timeout: 10000 });
    await humanClick(this.page, applyBtn);
    await thinkingPause(1500, 3000);
    console.log('  [Greenhouse] Clicked Apply button');
  }

  // Fill all personal info fields
  async fillPersonalInfo(profile) {
    const p = profile.personal;
    await this.filler.fillText('#first_name', p.firstName);
    await this.filler.fillText('#last_name', p.lastName);
    await this.filler.fillText('#email', p.email);
    await this.filler.fillText('#phone', p.phone);

    // Location fields
    await this.filler.smartFill('Location', `${p.city}, ${p.state}`);
    await this.filler.smartFill('LinkedIn Profile', p.linkedIn);
    await this.filler.smartFill('Website', p.portfolio);
    console.log('  [Greenhouse] Filled personal info');
  }

  // Upload resume PDF
  async uploadResume(resumePath) {
    // Greenhouse uses a hidden file input or drag-drop zone
    try {
      const fileInput = this.page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(resumePath);
      await randomDelay(800, 2000);
      console.log('  [Greenhouse] Uploaded resume');
    } catch (err) {
      console.warn('  [Greenhouse] Could not upload resume automatically:', err.message);
    }
  }

  // Fill custom questions using smart label matching
  async fillCustomQuestions(profile, answers) {
    const work = profile.work;

    // Work authorization / visa
    await this.filler.smartFill('authorized to work', answers.workAuthorization);
    await this.filler.smartFill('work authorization', answers.workAuthorization);
    await this.filler.smartFill('visa', work.visaStatus);
    await this.filler.smartFill('sponsorship', answers.requireSponsorship);

    // Salary
    await this.filler.smartFill('salary', work.salaryExpectation);
    await this.filler.smartFill('compensation', work.salaryExpectation);

    // Notice / availability
    await this.filler.smartFill('notice', work.noticePeriod);
    await this.filler.smartFill('start date', answers.startDate);

    // Relocation
    await this.filler.smartFill('relocate', work.relocationNote);
    await this.filler.smartFill('relocation', work.relocationNote);

    // Cover letter / why
    await this.filler.smartFill('cover letter', answers.coverLetter);
    await this.filler.smartFill('why', answers.whyInterested);

    console.log('  [Greenhouse] Filled custom questions');
  }

  // REVIEW PAUSE - waits for human confirmation before submitting
  async reviewPause() {
    console.log('\n  ====================================');
    console.log('  REVIEW PAUSE: Please review the form');
    console.log('  in the browser. Press ENTER to submit');
    console.log('  or Ctrl+C to abort this application.');
    console.log('  ====================================\n');
    await new Promise((resolve) => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', () => {
        process.stdin.pause();
        resolve();
      });
    });
  }

  // Submit the application form (called AFTER review approval)
  async submit() {
    const submitBtn = this.page.locator('#submit_app, button[type="submit"]:has-text("Submit"), button:has-text("Submit application")').first();
    await submitBtn.waitFor({ timeout: 10000 });
    await humanClick(this.page, submitBtn);
    await thinkingPause(2000, 4000);
    console.log('  [Greenhouse] Application submitted!');
  }

  // Full application flow
  async apply(job, profile, answers, resumePath) {
    await this.open(job.url);
    await this.clickApply();
    await this.fillPersonalInfo(profile);
    await this.uploadResume(resumePath);
    await this.fillCustomQuestions(profile, answers);
    await this.reviewPause();
    await this.submit();
  }
}
