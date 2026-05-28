// ============================================================
// LeverPage.js - POM adapter for Lever ATS
// Handles jobs.lever.co application forms
// ============================================================

import { FormFiller } from '../components/FormFiller.js';
import { humanClick, thinkingPause, randomDelay } from '../../utils/humanize.js';

export class LeverPage {
  constructor(page) {
    this.page = page;
    this.filler = new FormFiller(page);
  }

  async open(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await thinkingPause(1000, 2500);
    console.log('  [Lever] Opened job URL');
  }

  async clickApply() {
    const applyBtn = this.page.locator('a.template-btn-submit, a:has-text("Apply for this job"), button:has-text("Apply")').first();
    await applyBtn.waitFor({ timeout: 10000 });
    await humanClick(this.page, applyBtn);
    await thinkingPause(1500, 3000);
    console.log('  [Lever] Clicked Apply button');
  }

  async fillPersonalInfo(profile) {
    const p = profile.personal;
    // Lever uses name fields with specific placeholders
    await this.filler.fillText('input[name="name"]', p.fullName);
    await this.filler.fillText('input[name="email"]', p.email);
    await this.filler.fillText('input[name="phone"]', p.phone);
    await this.filler.fillText('input[name="org"]', 'U.S. Bank');
    await this.filler.smartFill('LinkedIn', p.linkedIn);
    await this.filler.smartFill('Website', p.portfolio);
    console.log('  [Lever] Filled personal info');
  }

  async uploadResume(resumePath) {
    try {
      const fileInput = this.page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(resumePath);
      await randomDelay(800, 2000);
      console.log('  [Lever] Uploaded resume');
    } catch (err) {
      console.warn('  [Lever] Resume upload failed:', err.message);
    }
  }

  async fillCustomQuestions(profile, answers) {
    const work = profile.work;

    // Lever uses textarea for cover letter
    const coverLetterField = this.page.locator('textarea[name="comments"]');
    if (await coverLetterField.count() > 0) {
      await this.filler.fillTextarea(coverLetterField, answers.coverLetter);
    }

    // Custom EEO / additional questions via smart label
    await this.filler.smartFill('authorized to work', answers.workAuthorization);
    await this.filler.smartFill('sponsorship', answers.requireSponsorship);
    await this.filler.smartFill('salary', work.salaryExpectation);
    await this.filler.smartFill('notice', work.noticePeriod);
    await this.filler.smartFill('relocate', work.relocationNote);
    console.log('  [Lever] Filled custom questions');
  }

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

  async submit() {
    const submitBtn = this.page.locator('button[type="submit"]:has-text("Submit application"), button:has-text("Submit")').first();
    await submitBtn.waitFor({ timeout: 10000 });
    await humanClick(this.page, submitBtn);
    await thinkingPause(2000, 4000);
    console.log('  [Lever] Application submitted!');
  }

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
