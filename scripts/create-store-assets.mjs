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
  const preview = (await readFile(resolve(siteAssets, 'workspace-preview.png'))).toString('base64');
  const renderPromo = async (width, height, file, headline, subhead) => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    const isMarquee = width > 500;
    await page.setContent(isMarquee ? `<!doctype html><style>
      @font-face{font-family:Hanken;src:url(data:font/woff2;base64,${(await readFile(resolve(root, 'public/fonts/HankenGrotesk-Variable.woff2'))).toString('base64')})}
      *{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;display:grid;grid-template-columns:580px 1fr;align-items:center;gap:46px;padding:56px 68px;color:#f5f8f5;background:#173744;font-family:Hanken,sans-serif;overflow:hidden}
      .brand{display:flex;align-items:center;gap:20px;font-size:36px;font-weight:800;letter-spacing:-.03em}.brand img{width:74px;height:74px;object-fit:contain}.brand b{color:#f0bd35}h1{max-width:11ch;margin:42px 0 16px;font-size:64px;line-height:1.02;letter-spacing:-.035em}p{max-width:24ch;margin:0;color:#d2e1df;font-size:25px;line-height:1.3}.preview{display:block;width:100%;border:1px solid #96afb3;border-radius:14px;box-shadow:0 20px 42px rgba(5,22,27,.28)}
    </style><div><div class="brand"><img src="data:image/png;base64,${logo}" alt=""><span>Clipboard<b>+</b></span></div><h1>${headline}</h1><p>${subhead}</p></div><img class="preview" src="data:image/png;base64,${preview}" alt="">` : `<!doctype html><style>
      @font-face{font-family:Hanken;src:url(data:font/woff2;base64,${(await readFile(resolve(root, 'public/fonts/HankenGrotesk-Variable.woff2'))).toString('base64')})}
      *{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;display:flex;align-items:center;gap:24px;padding:30px;color:#f5f8f5;background:#173744;font-family:Hanken,sans-serif;overflow:hidden}
      img{width:126px;height:126px;object-fit:contain}div{min-width:0}h1{margin:0;font-size:46px;letter-spacing:-.03em;line-height:.95}h1 b{color:#f0bd35}p{margin:14px 0 0;color:#d2e1df;font-size:17px;font-weight:500;line-height:1.3}
    </style><img src="data:image/png;base64,${logo}" alt=""><div><h1>${headline}<b>+</b></h1><p>${subhead}</p></div>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(output, file) });
    await page.close();
  };
  await renderPromo(440, 280, 'promo-small-440x280.png', 'Clipboard', 'Private clipboard history, ready in one click.');
  await renderPromo(1400, 560, 'promo-marquee-1400x560.png', 'Keep useful clips close.', 'Text, links, code, and smart snippets—ready when you need them.');

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
