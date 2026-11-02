import { readFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const extensionPath = resolve(root, 'dist-store');
const output = resolve(root, 'store-assets');
const siteAssets = resolve(root, 'docs/assets');
const profile = await mkdtemp(join(tmpdir(), 'clipboard-plus-assets-'));
await mkdir(output, { recursive: true });
await mkdir(siteAssets, { recursive: true });

const now = Date.now();
const clips = [
  { id: 'favorite-url', type: 'url', content: 'https://github.com/Tonys-Coding/ClipboardPlus', title: 'Clipboard+ on GitHub', sourceUrl: 'https://github.com/Tonys-Coding/ClipboardPlus', sourceApp: 'Google Chrome', favorite: true, createdAt: now - 900000, updatedAt: now - 900000 },
  { id: 'favorite-snippet', type: 'text', content: 'Hi {{name}}, I’ll send the update by {{time|tomorrow morning}}.', sourceApp: 'Clipboard+', favorite: true, createdAt: now - 1200000, updatedAt: now - 1200000 },
  { id: 'text', type: 'text', content: 'A clear clipboard should make repeated work disappear.', sourceUrl: 'https://example.com/product-notes', sourceApp: 'Google Chrome', favorite: false, createdAt: now - 120000, updatedAt: now - 120000 },
  { id: 'code', type: 'code', content: 'const usefulClips = history.filter((clip) => clip.favorite);', sourceUrl: 'https://developer.mozilla.org/', sourceApp: 'Google Chrome', favorite: false, createdAt: now - 360000, updatedAt: now - 360000 },
  { id: 'docs', type: 'url', content: 'https://developer.chrome.com/docs/extensions/', sourceUrl: 'https://developer.chrome.com/', sourceApp: 'Google Chrome', favorite: false, createdAt: now - 480000, updatedAt: now - 480000 },
  { id: 'note', type: 'text', content: 'Remember to remove tracking parameters before sharing the campaign link.', sourceUrl: 'https://notion.so/', sourceApp: 'Google Chrome', favorite: false, createdAt: now - 600000, updatedAt: now - 600000 },
];

let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
  const extensionId = new URL(worker.url()).host;

  const setupPage = await context.newPage();
  await setupPage.goto(`chrome-extension://${extensionId}/options.html`);
  await setupPage.evaluate(async (sampleClips) => {
    await chrome.storage.local.set({
      clipboardPlus: {
        version: 2,
        clips: sampleClips,
        settings: { autoCapture: false, historyLimit: 500, excludedSites: [], captureConsentVersion: 1 },
      },
    });
  }, clips);
  await setupPage.close();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('.clip-content').filter({ hasText: 'A clear clipboard should make repeated work disappear.' }).waitFor();
  await popup.addStyleTag({ content: `
    html, body, #root { width: 1280px !important; height: 800px !important; }
    body, #root { display: grid !important; place-items: center !important; background: #e3ebea !important; }
    .popup-shell { box-shadow: 0 24px 56px rgba(20, 55, 68, .17); border: 1px solid #c7d6d6; }
  ` });
  await popup.waitForTimeout(300);
  await popup.screenshot({ path: resolve(output, 'screenshot-1-history.png') });
  await popup.locator('.popup-shell').screenshot({ path: resolve(siteAssets, 'workspace-preview.png') });
  await popup.getByRole('button', { name: 'Dark mode' }).click();
  await popup.getByRole('button', { name: 'Dark mode', pressed: true }).waitFor();
  await popup.locator('.popup-shell').screenshot({ path: resolve(siteAssets, 'workspace-preview-dark.png') });
  await popup.getByRole('button', { name: 'Dark mode' }).click();
  await popup.getByRole('button', { name: 'Dark mode', pressed: false }).waitFor();

  await popup.getByRole('textbox', { name: 'Search clips' }).fill('github');
  await popup.screenshot({ path: resolve(output, 'screenshot-2-search.png') });
  await popup.getByRole('button', { name: 'Clear search' }).click();
  await popup.getByRole('button', { name: 'Code', exact: true }).click();
  await popup.screenshot({ path: resolve(output, 'screenshot-3-code-filter.png') });
  await popup.getByRole('button', { name: 'All' }).click();
  await popup.getByRole('button', { name: /add clip/i }).click();
  await popup.getByLabel(/Paste or type anything/).fill('Hello {{name}}, your summary is ready.');
  await popup.screenshot({ path: resolve(output, 'screenshot-4-smart-snippet.png') });
  await popup.close();

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByText('What to capture').waitFor();
  await options.locator('.capture-details-card').evaluate((card) => {
    window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 20);
  });
  await options.screenshot({ path: resolve(output, 'screenshot-5-privacy-controls.png'), fullPage: false });
  await copyFile(resolve(output, 'screenshot-5-privacy-controls.png'), resolve(siteAssets, 'capture-controls-preview.png'));
  await options.close();

  const logo = (await readFile(resolve(root, 'public/icons/clipboard-plus-logo.png'))).toString('base64');
  const renderPromo = async (width, height, file, sourceFile) => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    const source = (await readFile(resolve(output, 'source', sourceFile))).toString('base64');
    await page.setContent(`<!doctype html><style>
      html,body{margin:0;width:100%;height:100%;overflow:hidden}
      img{display:block;width:100%;height:100%;object-fit:cover}
    </style><img src="data:image/jpeg;base64,${source}" alt="">`);
    await page.locator('img').evaluate((image) => image.decode());
    await page.screenshot({ path: resolve(output, file) });
    await page.close();
  };
  await renderPromo(440, 280, 'promo-small-440x280.png', 'promo-small-original.jpeg');
  await renderPromo(1400, 560, 'promo-marquee-1400x560.png', 'promo-marquee-original.jpeg');

  const iconPage = await context.newPage();
  await iconPage.setViewportSize({ width: 128, height: 128 });
  await iconPage.setContent(`<style>*{box-sizing:border-box}body{margin:0;width:128px;height:128px;display:grid;place-items:center;background:transparent}img{width:96px;height:96px;object-fit:contain}</style><img src="data:image/png;base64,${logo}" alt="">`);
  await iconPage.screenshot({ path: resolve(output, 'icon-128-padded.png'), omitBackground: true });
  await iconPage.close();
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}

console.log(output);
