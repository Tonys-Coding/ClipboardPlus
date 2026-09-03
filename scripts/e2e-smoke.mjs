import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const extensionPath = resolve(import.meta.dirname, '..', 'dist');
const profilePath = await mkdtemp(join(tmpdir(), 'clipboard-plus-e2e-'));
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(`<!doctype html><html><head><title>Clipboard test page</title></head><body>
    <p id="keyboard-copy">Copied with Command C</p>
    <p id="menu-copy">Copied through the copy event</p>
    <pre id="code-copy">const captured = clips.map((clip) =&gt; clip.content);</pre>
    <input id="password" type="password" value="Never store this password">
  </body></html>`);
});

await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not start the smoke-test page.');

let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  const extensionId = new URL(worker.url()).host;

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);

  await page.locator('#keyboard-copy').selectText();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');

  await page.locator('#menu-copy').selectText();
  await page.evaluate(() => document.execCommand('copy'));

  await page.locator('#code-copy').selectText();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');

  await page.locator('#password').selectText();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await extensionPage.waitForFunction(async () => {
    const stored = await chrome.storage.local.get('clipboardPlus');
    return stored.clipboardPlus?.clips?.length >= 3;
  }, null, { timeout: 10_000 });

  const result = await extensionPage.evaluate(async () => {
    const stored = await chrome.storage.local.get('clipboardPlus');
    return stored.clipboardPlus;
  });
  const contents = result.clips.map((clip) => clip.content);

  if (!contents.includes('Copied with Command C')) throw new Error('Command+C was not persisted.');
  if (!contents.includes('Copied through the copy event')) throw new Error('The copy event was not persisted.');
  if (result.clips.find((clip) => clip.content.startsWith('const captured'))?.type !== 'code') throw new Error('Copied code was not classified as code.');
  if (contents.includes('Never store this password')) throw new Error('A password value was incorrectly persisted.');
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join('; ')}`);

  await page.bringToFront();
  await extensionPage.reload();
  await extensionPage.getByRole('textbox', { name: 'Search clips' }).waitFor({ timeout: 10_000 });
  const nativeResult = await extensionPage.evaluate(() => chrome.runtime.sendMessage({ type: 'SYNC_COMPANION' }));
  const nativeMessaging = nativeResult.companion?.available ? 'connected' : 'Chrome for Testing does not read user-level native hosts';

  console.log(JSON.stringify({ extensionId, captured: contents, codeClassified: true, passwordExcluded: true, popupDiagnostic: 'ready', nativeMessaging }, null, 2));
} finally {
  await context?.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
  await rm(profilePath, { recursive: true, force: true });
}
