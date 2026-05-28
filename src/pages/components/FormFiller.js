// ============================================================
// FormFiller.js - Reusable POM component for filling all
// standard form field types: text, select, radio, checkbox,
// textarea, and file upload
// ============================================================

import { humanType, humanClick, humanScroll, randomDelay } from '../../utils/humanize.js';

export class FormFiller {
  constructor(page) {
    this.page = page;
  }

  // Fill a text/email/tel input with human-like typing
  async fillText(selectorOrLocator, value, options = {}) {
    if (!value) return;
    const locator = typeof selectorOrLocator === 'string'
      ? this.page.locator(selectorOrLocator).first()
      : selectorOrLocator;
    await humanScroll(this.page, locator);
    await humanType(this.page, locator, String(value), options);
    await randomDelay(100, 300);
  }

  // Fill a textarea with human-like typing
  async fillTextarea(selectorOrLocator, value) {
    if (!value) return;
    const locator = typeof selectorOrLocator === 'string'
      ? this.page.locator(selectorOrLocator).first()
      : selectorOrLocator;
    await humanScroll(this.page, locator);
    await humanType(this.page, locator, String(value), { minDelay: 20, maxDelay: 80 });
  }

  // Select from native <select> dropdown by visible text or value
  async selectOption(selectorOrLocator, value) {
    if (!value) return;
    const locator = typeof selectorOrLocator === 'string'
      ? this.page.locator(selectorOrLocator).first()
      : selectorOrLocator;
    await humanScroll(this.page, locator);
    await randomDelay(100, 300);
    try {
      await locator.selectOption({ label: value });
    } catch {
      await locator.selectOption({ value });
    }
    await randomDelay(150, 400);
  }

  // Handle custom dropdown: click trigger then click matching option
  async selectCustomDropdown(triggerSelector, optionText) {
    if (!optionText) return;
    const trigger = this.page.locator(triggerSelector).first();
    await humanScroll(this.page, trigger);
    await humanClick(this.page, trigger);
    await randomDelay(300, 700);
    const option = this.page.locator('[role="listbox"] [role="option"]').filter({ hasText: optionText }).first();
    await option.waitFor({ timeout: 5000 });
    await humanClick(this.page, option);
    await randomDelay(200, 500);
  }

  // Click radio button by label text
  async selectRadio(labelText) {
    if (!labelText) return;
    const radio = this.page.getByRole('radio', { name: labelText }).first();
    await humanScroll(this.page, radio);
    await humanClick(this.page, radio);
    await randomDelay(150, 400);
  }

  // Toggle a checkbox by label or selector
  async toggleCheckbox(selectorOrLabel, shouldBeChecked = true) {
    let checkbox;
    if (selectorOrLabel.startsWith('#') || selectorOrLabel.startsWith('.') || selectorOrLabel.startsWith('[')) {
      checkbox = this.page.locator(selectorOrLabel).first();
    } else {
      checkbox = this.page.getByRole('checkbox', { name: selectorOrLabel }).first();
    }
    await humanScroll(this.page, checkbox);
    const isChecked = await checkbox.isChecked();
    if (isChecked !== shouldBeChecked) {
      await humanClick(this.page, checkbox);
    }
    await randomDelay(100, 300);
  }

  // Upload a file to an input[type=file] field
  async uploadFile(selector, filePath) {
    if (!filePath) return;
    const fileInput = this.page.locator(selector);
    await fileInput.setInputFiles(filePath);
    await randomDelay(500, 1200);
    console.log('  Uploaded file: ' + filePath);
  }

  // Smart fill: find by label and fill appropriate field type
  async smartFill(labelText, value) {
    if (!value) return;
    const byLabel = this.page.getByLabel(labelText, { exact: false });
    const count = await byLabel.count();
    if (count > 0) {
      const tag = await byLabel.first().evaluate(el => el.tagName.toLowerCase());
      if (tag === 'select') {
        await this.selectOption(byLabel.first(), value);
      } else {
        await this.fillText(byLabel.first(), value);
      }
    }
  }
}
