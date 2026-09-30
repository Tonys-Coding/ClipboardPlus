import { readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const extensionPath = resolve(root, 'dist-store');
const output = resolve(root, 'store-assets');
const profile = await mkdtemp(join(tmpdir(), 'clipboard-plus-assets-'));
await mkdir(output, { recursive: true });

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
  await popup.getByText('A clear clipboard should make repeated work disappear.').waitFor();
  await popup.addStyleTag({ content: `
    html, body, #root { width: 1280px !important; height: 800px !important; }
    body, #root { display: grid !important; place-items: center !important; background: radial-gradient(circle at 20% 0%, #2a2412, #090908 47%) !important; }
    .popup-shell { box-shadow: 0 28px 90px rgba(0,0,0,.7); border: 1px solid #3e3826; }
    .clip-card { animation: none !important; }
    .notice { display: none !important; }
  ` });
  await popup.waitForTimeout(300);
  await popup.screenshot({ path: resolve(output, 'screenshot-1-history.png') });

  await popup.getByRole('textbox', { name: 'Search clips' }).fill('github');
  await popup.screenshot({ path: resolve(output, 'screenshot-2-search.png') });
  await popup.getByRole('button', { name: 'Clear search' }).click();
  await popup.getByRole('button', { name: 'Code' }).click();
  await popup.screenshot({ path: resolve(output, 'screenshot-3-code-filter.png') });
  await popup.getByRole('button', { name: 'All' }).click();
  await popup.getByRole('button', { name: /add clip/i }).click();
  await popup.getByLabel(/Paste or type anything/).fill('Hello {{name}}, your summary is ready.');
  await popup.screenshot({ path: resolve(output, 'screenshot-4-smart-snippet.png') });
  await popup.close();

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByText('Automatic cleanup').waitFor();
  await options.screenshot({ path: resolve(output, 'screenshot-5-privacy-controls.png'), fullPage: false });
  await options.close();

  const logo = (await readFile(resolve(root, 'public/icons/clipboard-plus-logo.png'))).toString('base64');
  const renderPromo = async (width, height, file, headline, subhead) => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    await page.setContent(`<!doctype html><style>
      @font-face{font-family:Satoshi;src:url(data:font/woff2;base64,${(await readFile(resolve(root, 'public/fonts/Satoshi-Variable.woff2'))).toString('base64')})}
      *{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;display:flex;align-items:center;gap:${Math.round(width * .05)}px;padding:${Math.round(width * .065)}px;color:#f4f0e7;background:radial-gradient(circle at 15% 0%,#3b3111,#0a0a09 52%);font-family:Satoshi,sans-serif;overflow:hidden}
      img{width:${Math.round(height * .46)}px;height:${Math.round(height * .46)}px;object-fit:contain;filter:drop-shadow(0 14px 25px #000)}div{min-width:0}h1{margin:0;font-size:${Math.round(height * .17)}px;letter-spacing:-.05em;line-height:.95}h1 b{color:#e6b82e}p{margin:${Math.round(height * .045)}px 0 0;color:#beb8ad;font-size:${Math.round(height * .062)}px;font-weight:500;line-height:1.25}
    </style><img src="data:image/png;base64,${logo}" alt=""><div><h1>${headline}<b>+</b></h1><p>${subhead}</p></div>`);
    await page.screenshot({ path: resolve(output, file) });
    await page.close();
  };
  await renderPromo(440, 280, 'promo-small-440x280.png', 'Clipboard', 'Private clipboard history, ready in one click.');
  await renderPromo(1400, 560, 'promo-marquee-1400x560.png', 'Clipboard', 'Text, links, code, favorites, and smart snippets—kept on your device.');

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
