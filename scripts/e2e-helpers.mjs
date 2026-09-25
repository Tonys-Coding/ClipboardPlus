/**
 * Shared helpers for the Chromium smoke tests.
 *
 * Playwright's `waitForFunction` evaluates `const success = predicate(); if (success) { fulfill(success); }`
 * inside the page (playwright-core `waitForFunctionExpression`), so an async predicate fulfils
 * immediately with its own Promise and every check passes without polling. These helpers poll
 * with explicit awaited assertions instead.
 */

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function pollUntil(check, { timeout = 10_000, interval = 200, description = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  let lastValue;
  let lastError = null;
  for (;;) {
    try {
      lastValue = await check();
      if (lastValue) return lastValue;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) {
      const detail = lastError ? ` Last error: ${lastError.message}` : ` Last value: ${JSON.stringify(lastValue)}`;
      throw new Error(`Timed out after ${timeout}ms waiting for ${description}.${detail}`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/** Reads the real clipboard from a page that has clipboard-read granted and focus. */
export async function readClipboard(page) {
  await page.bringToFront();
  return page.evaluate(() => navigator.clipboard.readText());
}

export async function getServiceWorker(context) {
  const existing = context.serviceWorkers()[0];
  if (existing) return existing;
  return context.waitForEvent('serviceworker', { timeout: 15_000 });
}

/** Adds a clip through the popup panel and waits until it is durably stored. */
export async function addClip(page, content) {
  await page.getByRole('button', { name: /add clip/i }).click();
  await page.getByLabel(/Paste or type anything/).fill(content);
  await page.getByRole('button', { name: /save clip/i }).click();
  await page.getByLabel(/Paste or type anything/).waitFor({ state: 'detached' });
  await pollUntil(() => page.evaluate(async (expected) => (
    (await chrome.storage.local.get('clipboardPlus')).clipboardPlus?.clips?.some((clip) => clip.content === expected) ?? false
  ), content.trim()), { description: `the clip "${content.slice(0, 32)}" to be stored` });
}
