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
    <p id="filtered-url">https://filtered.example/path</p>
    <p id="source-free">Captured without source details</p>
    <p id="paused-copy">This copy happened during a privacy pause</p>
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

  const onboardingPage = await context.newPage();
  await onboardingPage.goto(`chrome-extension://${extensionId}/options.html`);
  const enableCapture = onboardingPage.getByRole('button', { name: 'Enable website capture' });
  if (await enableCapture.isVisible()) await enableCapture.click();
  await onboardingPage.waitForFunction(async () => {
    const stored = await chrome.storage.local.get('clipboardPlus');
    const allowed = await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
    const registrations = await chrome.scripting.getRegisteredContentScripts({ ids: ['clipboard-plus-web-capture'] });
    return stored.clipboardPlus?.settings?.autoCapture === true && allowed && registrations.length === 1;
  }, null, { timeout: 10_000 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.waitForTimeout(250);
  const captureHealth = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const registrations = await chrome.scripting.getRegisteredContentScripts({ ids: ['clipboard-plus-web-capture'] });
    const allowed = await chrome.permissions.getAll();
    if (!tabs[0]?.id) return { tabs, registrations, allowed };
    try {
      return await chrome.tabs.sendMessage(tabs[0].id, { type: 'PING_CAPTURE' });
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), tabs, registrations, allowed };
    }
  });
  if (!captureHealth?.ready || !captureHealth.settingsLoaded || !captureHealth.enabled) {
    throw new Error(`Registered capture listener is not ready: ${JSON.stringify(captureHealth)}`);
  }

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

  const popupTypography = await extensionPage.evaluate(async () => {
    await document.fonts.ready;
    return {
      family: getComputedStyle(document.body).fontFamily,
      loaded: document.fonts.check('12px Satoshi'),
    };
  });

  const result = await extensionPage.evaluate(async () => {
    const stored = await chrome.storage.local.get('clipboardPlus');
    return stored.clipboardPlus;
  });
  const contents = result.clips.map((clip) => clip.content);

  if (!contents.includes('Copied with Command C')) throw new Error('Command+C was not persisted.');
  if (!contents.includes('Copied through the copy event')) throw new Error('The copy event was not persisted.');
  if (result.clips.find((clip) => clip.content.startsWith('const captured'))?.type !== 'code') throw new Error('Copied code was not classified as code.');
  if (contents.includes('Never store this password')) throw new Error('A password value was incorrectly persisted.');
  if (!popupTypography.family.includes('Satoshi') || !popupTypography.loaded) throw new Error('The bundled Satoshi font was not applied.');
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join('; ')}`);

  await extensionPage.evaluate(() => chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    payload: { captureTypes: ['text'], capturePageTitle: false, captureSourceUrl: false, captureSourceApp: false },
  }));
  await page.waitForTimeout(100);
  await page.locator('#filtered-url').selectText();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  await page.locator('#source-free').selectText();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');

  await extensionPage.evaluate(() => chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    payload: { capturePaused: true, capturePausedUntil: Date.now() + 60_000 },
  }));
  await page.waitForTimeout(100);
  await page.locator('#paused-copy').selectText();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  await extensionPage.evaluate(() => chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    payload: { capturePaused: false, capturePausedUntil: null },
  }));
  await page.waitForTimeout(150);

  const privacyControlResult = await extensionPage.evaluate(async () => (await chrome.storage.local.get('clipboardPlus')).clipboardPlus);
  const filteredUrl = privacyControlResult.clips.find((clip) => clip.content === 'https://filtered.example/path');
  const sourceFree = privacyControlResult.clips.find((clip) => clip.content === 'Captured without source details');
  const pausedCopy = privacyControlResult.clips.find((clip) => clip.content === 'This copy happened during a privacy pause');
  if (filteredUrl) throw new Error('A disabled URL capture category was persisted.');
  if (!sourceFree || sourceFree.title || sourceFree.sourceUrl || sourceFree.sourceApp) throw new Error('Source metadata preferences were not honored.');
  if (pausedCopy) throw new Error('A copy made during a privacy pause was persisted.');

  await page.bringToFront();
  await extensionPage.reload();
  await extensionPage.getByRole('textbox', { name: 'Search clips' }).waitFor({ timeout: 10_000 });

  await extensionPage.getByRole('button', { name: /add clip/i }).click();
  await extensionPage.getByLabel(/Paste or type anything/).fill('Hello {{name|friend}}');
  await extensionPage.getByRole('button', { name: /save clip/i }).click();
  const snippetRow = extensionPage.locator('article').filter({ hasText: 'Hello {{name|friend}}' });
  await snippetRow.getByRole('button', { name: /copy hello/i }).click();
  await extensionPage.getByRole('dialog', { name: 'Fill in the fields' }).waitFor();
  await extensionPage.getByRole('textbox', { name: 'name' }).fill('Tony');
  await extensionPage.getByRole('button', { name: 'Copy snippet' }).click();
  await extensionPage.getByText('Snippet copied').waitFor();

  const transformRow = extensionPage.locator('article').filter({ hasText: 'Copied with Command C' });
  await transformRow.getByRole('button', { name: 'Clip actions' }).click();
  await extensionPage.getByRole('menuitem', { name: 'Transform & copy' }).click();
  await extensionPage.getByRole('button', { name: /uppercase/i }).click();
  if (await extensionPage.getByLabel('Transformation preview').textContent() !== 'COPIED WITH COMMAND C') {
    throw new Error('The transformation preview did not update.');
  }
  await extensionPage.getByRole('button', { name: 'Copy result' }).click();
  await extensionPage.getByText('Transformed copy ready').waitFor();

  const nativeResult = await extensionPage.evaluate(() => chrome.runtime.sendMessage({ type: 'SYNC_COMPANION' }));
  const nativeMessaging = nativeResult.companion?.available ? 'connected' : 'Chrome for Testing does not read user-level native hosts';

  console.log(JSON.stringify({ extensionId, captured: contents, codeClassified: true, passwordExcluded: true, captureTypes: true, privacyPause: true, sourceMetadataControls: true, popupDiagnostic: 'ready', smartSnippets: true, pasteTransformations: true, typography: popupTypography.family, nativeMessaging }, null, 2));
} finally {
  await context?.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
  await rm(profilePath, { recursive: true, force: true });
}
