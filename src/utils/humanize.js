// ============================================================
// humanize.js — Randomized typing, mouse, and scroll helpers
// to make automation feel more human and bypass bot detection
// ============================================================

/**
 * Sleep for a random duration between min and max milliseconds
 */
export async function randomDelay(min = 80, max = 250) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Type text into a locator character by character with random delays
 * to simulate human typing speed and rhythm.
 */
export async function humanType(page, locator, text, options = {}) {
  const {
    minDelay = 40,
    maxDelay = 180,
    mistakeProbability = 0.03,   // 3% chance of typo+correction per char
    preClickDelay = true,
  } = options;

  // Click the element first
  await locator.click();
  if (preClickDelay) await randomDelay(100, 400);

  // Clear existing content
  await locator.selectText().catch(() => {});
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');

  for (const char of text) {
    // Random typo simulation
    if (Math.random() < mistakeProbability) {
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
      await page.keyboard.type(wrongChar);
      await randomDelay(minDelay, maxDelay);
      await page.keyboard.press('Backspace');
      await randomDelay(minDelay, maxDelay * 2);
    }
    await page.keyboard.type(char);
    await randomDelay(minDelay, maxDelay);
  }
}

/**
 * Hover over an element with a slight random offset to simulate
 * natural mouse movement before clicking.
 */
export async function humanClick(page, locator, options = {}) {
  const { preHoverDelay = true, postClickDelay = true } = options;

  const box = await locator.boundingBox();
  if (!box) {
    await locator.click();
    return;
  }

  // Random point within the element boundary (not dead center)
  const x = box.x + box.width * (0.3 + Math.random() * 0.4);
  const y = box.y + box.height * (0.3 + Math.random() * 0.4);

  if (preHoverDelay) await randomDelay(100, 300);
  await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 8) + 3 });
  await randomDelay(50, 150);
  await page.mouse.click(x, y);
  if (postClickDelay) await randomDelay(100, 400);
}

/**
 * Scroll to element naturally with eased steps.
 */
export async function humanScroll(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await randomDelay(200, 600);
  // Additional micro scroll to simulate natural reading
  await page.mouse.wheel(0, Math.floor(Math.random() * 60) - 30);
  await randomDelay(100, 300);
}

/**
 * Wait for a random pause — simulate reading the page before acting.
 */
export async function thinkingPause(min = 500, max = 2000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Move mouse in a random idle pattern to simulate alive user presence.
 */
export async function idleMouseMovement(page, steps = 3) {
  const viewport = page.viewportSize();
  if (!viewport) return;
  for (let i = 0; i < steps; i++) {
    const x = Math.floor(Math.random() * viewport.width);
    const y = Math.floor(Math.random() * viewport.height);
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
    await randomDelay(200, 600);
  }
}
