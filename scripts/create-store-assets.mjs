import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CodeXml, Copy, Link2, PencilRuler } from 'lucide-react';

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
  const icon = (component) => renderToStaticMarkup(createElement(component, { size: 22, strokeWidth: 1.8, 'aria-hidden': true }));
  const promoContext = await context.browser().newContext({ deviceScaleFactor: 3 });
  const renderPromo = async (width, height, file, headline, subhead) => {
    const page = await promoContext.newPage();
    await page.setViewportSize({ width, height });
    const isMarquee = width > 500;
    await page.setContent(isMarquee ? `<!doctype html><style>
      @font-face{font-family:"Hanken Grotesk";src:url(data:font/woff2;base64,${(await readFile(resolve(root, 'public/fonts/HankenGrotesk-Variable.woff2'))).toString('base64')})}
      *{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;display:grid;grid-template-columns:530px 1fr;align-items:center;gap:38px;padding:54px 64px;color:#f5f8f5;background:#173744;font-family:"Hanken Grotesk",sans-serif;overflow:hidden}
      .brand{display:flex;align-items:center;gap:20px;font-size:37px;font-weight:800;letter-spacing:-.03em}.brand img{width:76px;height:76px;object-fit:contain}.brand b{color:#f0bd35}h1{max-width:11ch;margin:34px 0 16px;font-size:68px;line-height:1.02;letter-spacing:-.035em}p{max-width:23ch;margin:0;color:#d2e1df;font-size:25px;line-height:1.3}
      .product{height:450px;overflow:hidden;border:1px solid #9bb2b6;border-radius:14px;background:#fff;color:#1c3038;box-shadow:0 20px 42px rgba(5,22,27,.28)}
      .product-head{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;border-bottom:1px solid #dce4e4;font-size:19px;font-weight:760}.product-head small{font-size:13px;font-weight:500;color:#586b72}
      .product-body{display:grid;grid-template-columns:54% 46%;height:392px}.clip-list{border-right:1px solid #dce4e4}.clip{display:grid;grid-template-columns:24px minmax(0,1fr);gap:14px;min-height:104px;padding:18px 18px;border-bottom:1px solid #dce4e4}.clip.selected{background:#fff8e7;box-shadow:inset 2px 0 #b3830f}.clip svg{width:23px;height:23px;margin-top:2px}.clip.text svg{color:#996e11}.clip.code svg{color:#755d92}.clip.url svg{color:#217085}.clip strong{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere;font-size:17px;line-height:1.25;font-weight:720}.clip small{display:block;margin-top:9px;font-size:12px;color:#586b72;white-space:nowrap}
      .detail{position:relative;padding:21px 22px;background:#f3f5f3}.detail-kind{display:flex;align-items:center;gap:10px;padding-bottom:18px;border-bottom:1px solid #dce4e4;color:#674700;font-size:13px;font-weight:750}.detail-kind svg{width:20px;height:20px}.detail-copy{margin:25px 0 0;color:#1c3038;font-size:21px;line-height:1.3;font-weight:710}.detail-source{position:absolute;right:22px;bottom:86px;left:22px;padding-top:13px;border-top:1px solid #dce4e4;color:#586b72;font-size:12px}.detail-source b{float:right;color:#1c3038}.copy-button{position:absolute;right:22px;bottom:21px;left:22px;height:42px;display:flex;align-items:center;justify-content:center;gap:9px;border-radius:5px;background:#173744;color:#fff;font-size:14px;font-weight:700}.copy-button svg{width:18px;height:18px}
    </style><div><div class="brand"><img src="data:image/png;base64,${logo}" alt=""><span>Clipboard<b>+</b></span></div><h1>${headline}</h1><p>${subhead}</p></div><div class="product"><div class="product-head">Recent <small>4 clips</small></div><div class="product-body"><div class="clip-list"><div class="clip text selected">${icon(PencilRuler)}<div><strong>A clear clipboard should make repeated work disappear.</strong><small>example.com · TEXT</small></div></div><div class="clip code">${icon(CodeXml)}<div><strong>const usefulClips = history.filter(…)</strong><small>developer.mozilla.org · CODE</small></div></div><div class="clip url">${icon(Link2)}<div><strong>https://developer.chrome.com/docs/extensions/</strong><small>developer.chrome.com · URL</small></div></div></div><div class="detail"><div class="detail-kind">${icon(PencilRuler)} TEXT</div><div class="detail-copy">A clear clipboard should make repeated work disappear.</div><div class="detail-source">Source <b>example.com</b></div><div class="copy-button">${icon(Copy)} Copy clip</div></div></div></div>` : `<!doctype html><style>
      @font-face{font-family:"Hanken Grotesk";src:url(data:font/woff2;base64,${(await readFile(resolve(root, 'public/fonts/HankenGrotesk-Variable.woff2'))).toString('base64')})}
      *{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;display:flex;align-items:center;gap:24px;padding:30px;color:#f5f8f5;background:#173744;font-family:"Hanken Grotesk",sans-serif;overflow:hidden}
      img{width:126px;height:126px;object-fit:contain}div{min-width:0}h1{margin:0;font-size:46px;letter-spacing:-.03em;line-height:.95}h1 b{color:#f0bd35}p{margin:14px 0 0;color:#d2e1df;font-size:17px;font-weight:500;line-height:1.3}
    </style><img src="data:image/png;base64,${logo}" alt=""><div><h1>${headline}<b>+</b></h1><p>${subhead}</p></div>`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode()));
    });
    const supersampled = await page.screenshot({ scale: 'device' });
    if (supersampled.readUInt32BE(16) !== width * 3 || supersampled.readUInt32BE(20) !== height * 3) {
      throw new Error(`Promo render did not use 3× device pixels: ${file} (${supersampled.readUInt32BE(16)}×${supersampled.readUInt32BE(20)})`);
    }
    const resizedBase64 = await page.evaluate(async ({ source, targetWidth, targetHeight }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const drawing = canvas.getContext('2d');
      if (!drawing) throw new Error('Could not resize the promo image.');
      drawing.imageSmoothingEnabled = true;
      drawing.imageSmoothingQuality = 'high';
      drawing.drawImage(image, 0, 0, targetWidth, targetHeight);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { source: supersampled.toString('base64'), targetWidth: width, targetHeight: height });
    const finalPng = Buffer.from(resizedBase64, 'base64');
    if (finalPng.readUInt32BE(16) !== width || finalPng.readUInt32BE(20) !== height) {
      throw new Error(`Promo image has the wrong store dimensions: ${file}`);
    }
    await writeFile(resolve(output, file), finalPng);
    await page.close();
  };
  await renderPromo(440, 280, 'promo-small-440x280.png', 'Clipboard', 'Private clipboard history, ready in one click.');
  await renderPromo(1400, 560, 'promo-marquee-1400x560.png', 'Keep useful clips close.', 'Text, links, code, and smart snippets—ready when you need them.');
  await promoContext.close();

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
