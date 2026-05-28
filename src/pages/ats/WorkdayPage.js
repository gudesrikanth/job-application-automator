// ============================================================
// WorkdayPage.js - POM adapter for Workday ATS
// Handles *.myworkdayjobs.com application forms
// Workday is multi-step and uses Angular-style dynamic DOM
// ============================================================

import { FormFiller } from '../components/FormFiller.js';
import { humanClick, thinkingPause, randomDelay, idleMouseMovement } from '../../utils/humanize.js';

export class WorkdayPage {
  constructor(page) {
    this.page = page;
    this.filler = new FormFiller(page);
  }

  async open(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await thinkingPause(2000, 4000);
    console.log('  [Workday] Opened job URL');
  }

  async clickApply() {
    // Workday Apply button varies by implementation
    const applyBtn = this.page.locator(
      'a[data-automation-id="applyButton"], button:has-text("Apply"), a:has-text("Apply Now")'
    ).first();
    await applyBtn.waitFor({ timeout: 15000 });
    await idleMouseMovement(this.page, 2);
    await humanClick(this.page, applyBtn);
    await thinkingPause(2000, 4000);
    console.log('  [Workday] Clicked Apply button');
  }

  // Step 1: My Information
  async fillMyInformation(profile) {
    const p = profile.personal;
    await thinkingPause(1000, 2000);

    // Workday uses data-automation-id attributes for stable selectors
    await this.filler.fillText('[data-automation-id="legalNameSection_firstName"]', p.firstName);
    await this.filler.fillText('[data-automation-id="legalNameSection_lastName"]', p.lastName);
    await this.filler.fillText('[data-automation-id="email"]', p.email);
    await this.filler.fillText('[data-automation-id="phone-number"]', p.phone);

    // Address
    await this.filler.smartFill('Address Line 1', p.city);
    await this.filler.smartFill('City', p.city);
    await this.filler.smartFill('State', p.state);
    await this.filler.smartFill('Zip', p.zip);

    console.log('  [Workday] Filled My Information step');
  }

  // Step 2: My Experience - Upload resume
  async fillMyExperience(resumePath) {
    await this.nextStep();
    await thinkingPause(1500, 3000);

    // Upload resume
    try {
      const uploadBtn = this.page.locator('[data-automation-id="file-upload-input-ref"]').first();
      if (await uploadBtn.count() > 0) {
        await uploadBtn.setInputFiles(resumePath);
        await randomDelay(1500, 3000);
        console.log('  [Workday] Uploaded resume');
      }
    } catch (err) {
      console.warn('  [Workday] Resume upload failed:', err.message);
    }
  }

  // Step 3: Application Questions
  async fillApplicationQuestions(profile, answers) {
    await this.nextStep();
    await thinkingPause(1000, 2500);
    const work = profile.work;

    // Common Workday questions via automation IDs and smart fill
    await this.filler.smartFill('Are you legally authorized', answers.workAuthorization);
    await this.filler.smartFill('Do you now or in the future require sponsorship', answers.requireSponsorship);
    await this.filler.smartFill('willing to relocate', work.relocationNote);
    await this.filler.smartFill('salary', work.salaryExpectation);
    await this.filler.smartFill('desired salary', work.salaryExpectation);
    await this.filler.smartFill('notice period', work.noticePeriod);
    await this.filler.smartFill('earliest start date', answers.startDate);
    await this.filler.smartFill('how did you hear', answers.howDidYouHear);

    // Workday-specific radio buttons for common yes/no questions
    await this.handleYesNoQuestion('authorized to work', 'Yes');
    await this.handleYesNoQuestion('require sponsorship', 'Yes');
    await this.handleYesNoQuestion('willing to relocate', 'Yes');

    console.log('  [Workday] Filled Application Questions step');
  }

  // Handle Workday yes/no radio groups
  async handleYesNoQuestion(labelText, answer) {
    try {
      const label = this.page.locator(`label, legend`).filter({ hasText: new RegExp(labelText, 'i') }).first();
      if (await label.count() === 0) return;

      // Find adjacent radio group
      const radioGroup = label.locator('..').locator('input[type="radio"]').filter({ hasText: answer });
      if (await radioGroup.count() > 0) {
        await humanClick(this.page, radioGroup.first());
        await randomDelay(200, 500);
      }
    } catch {
      // Not found, skip
    }
  }

  // Click the Next/Continue button to advance multi-step form
  async nextStep() {
    const nextBtn = this.page.locator(
      'button[data-automation-id="bottom-navigation-next-button"], button:has-text("Next"), button:has-text("Continue")'
    ).first();
    try {
      await nextBtn.waitFor({ timeout: 8000 });
      await humanClick(this.page, nextBtn);
      await thinkingPause(1500, 3000);
    } catch (err) {
      console.warn('  [Workday] Could not find Next button:', err.message);
    }
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
    const submitBtn = this.page.locator(
      'button[data-automation-id="bottom-navigation-next-button"]:has-text("Submit"), button:has-text("Submit")'
    ).first();
    await submitBtn.waitFor({ timeout: 10000 });
    await humanClick(this.page, submitBtn);
    await thinkingPause(3000, 5000);
    console.log('  [Workday] Application submitted!');
  }

  async apply(job, profile, answers, resumePath) {
    await this.open(job.url);
    await this.clickApply();
    await this.fillMyInformation(profile);
    await this.fillMyExperience(resumePath);
    await this.fillApplicationQuestions(profile, answers);
    await this.nextStep(); // Review step
    await this.reviewPause();
    await this.submit();
  }
}
