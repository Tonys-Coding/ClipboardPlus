import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';
import { assert } from './e2e-helpers.mjs';

const root = resolve(import.meta.dirname, '..', 'docs');
const review = resolve(import.meta.dirname, '..', '.impeccable', 'review');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const pages = ['index.html', 'privacy.html', 'support.html', 'data-deletion.html', 'release-notes.html'];

const server = createServer(async (request, response) => {
  const path = resolve(root, decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname.slice(1) || 'index.html'));
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const bytes = await readFile(path);
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not start the site smoke test.');
const origin = `http://127.0.0.1:${address.port}`;
await mkdir(review, { recursive: true });

let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const path of pages) {
    const response = await page.goto(`${origin}/${path}`);
    assert(response?.ok(), `${path} did not load.`);
    await page.evaluate(() => document.fonts.ready);
    assert(await page.locator('main h1').count() === 1, `${path} must have one main heading.`);
    assert(await page.getByRole('button', { name: 'Switch to dark mode' }).count() === 1, `${path} is missing the theme control.`);
    const check = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      images: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
      font: getComputedStyle(document.body).fontFamily,
    }));
    assert(!check.overflow && check.images && check.font.includes('Hanken Grotesk'), `${path} failed desktop layout or asset checks: ${JSON.stringify(check)}`);
  }

  await page.goto(`${origin}/index.html`);
  await page.screenshot({ path: resolve(review, 'site-home-light-desktop.png'), fullPage: true });
  const firstBackground = await page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  assert(await page.locator('html').getAttribute('data-theme') === 'dark', 'The website did not switch to dark mode.');
  assert(await page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor) !== firstBackground, 'Dark mode did not change the website surface.');
  await page.screenshot({ path: resolve(review, 'site-home-dark-desktop.png'), fullPage: true });
  await page.goto(`${origin}/privacy.html`);
  assert(await page.locator('html').getAttribute('data-theme') === 'dark', 'The website theme did not persist between pages.');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of pages) {
    await page.goto(`${origin}/${path}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert(!overflow, `${path} overflows a 390px screen.`);
  }
  await page.goto(`${origin}/index.html`);
  await page.screenshot({ path: resolve(review, 'site-home-light-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.screenshot({ path: resolve(review, 'site-home-dark-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.goto(`${origin}/privacy.html`);
  await page.screenshot({ path: resolve(review, 'site-privacy-light-mobile.png'), fullPage: true });
  assert(errors.length === 0, `Website script errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ pages: pages.length, desktop: true, mobile: true, themePersists: true, errors: 0 }, null, 2));
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
