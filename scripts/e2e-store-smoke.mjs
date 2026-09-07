import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const extensionPath = resolve(import.meta.dirname, '..', 'dist');
const profilePath = await mkdtemp(join(tmpdir(), 'clipboard-plus-store-e2e-'));
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end('<!doctype html><html><head><title>Existing tab</title></head><body><p id="copy-me">Captured without a refresh</p></body></html>');
});
await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not start the store smoke-test page.');
let context;

try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
  const extensionId = new URL(worker.url()).host;

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByText('Enable automatic website capture?').waitFor();

  const initial = await options.evaluate(async () => ({
    state: (await chrome.storage.local.get('clipboardPlus')).clipboardPlus,
    allowed: await chrome.permissions.getAll(),
    registrations: await chrome.scripting.getRegisteredContentScripts(),
    manifest: chrome.runtime.getManifest(),
  }));
  if (initial.state.settings.autoCapture !== false) throw new Error('Fresh store installs must not capture automatically.');
  if (initial.state.settings.retentionDays !== 0) throw new Error('Fresh store installs must keep clips indefinitely by default.');
  if (initial.state.settings.captureTypes.join(',') !== 'text,url,code') throw new Error('Fresh store installs must enable all automatic capture categories.');
  if (initial.state.settings.capturePaused !== false) throw new Error('Fresh store installs must not begin paused.');
  if (!initial.state.settings.capturePageTitle || !initial.state.settings.captureSourceUrl || !initial.state.settings.captureSourceApp) throw new Error('Fresh store installs must preserve existing source metadata behavior.');
  if (initial.allowed.origins?.length) throw new Error('Fresh store installs must not have website access.');
  if (initial.registrations.length) throw new Error('Fresh store installs must not register a content script.');
  if (initial.manifest.permissions?.includes('nativeMessaging')) throw new Error('The store manifest includes Native Messaging.');
  if (initial.manifest.host_permissions?.length) throw new Error('The store manifest includes required website access.');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: /add clip/i }).click();
  await popup.getByLabel(/Paste or type anything/).fill('Manual store-profile clip');
  await popup.getByRole('button', { name: /save clip/i }).click();
  await popup.getByText('Manual store-profile clip').waitFor();

  const existingTab = await context.newPage();
  await existingTab.goto(`http://127.0.0.1:${address.port}`);
  await options.bringToFront();
  await options.getByRole('button', { name: 'Enable website capture' }).click();
  await options.waitForFunction(async () => {
    const stored = await chrome.storage.local.get('clipboardPlus');
    const allowed = await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
    const registrations = await chrome.scripting.getRegisteredContentScripts({ ids: ['clipboard-plus-web-capture'] });
    return stored.clipboardPlus?.settings?.autoCapture === true && allowed && registrations.length === 1;
  }, null, { timeout: 10_000 });
  await existingTab.bringToFront();
  await existingTab.locator('#copy-me').selectText();
  await existingTab.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  await options.waitForFunction(async () => {
    const stored = await chrome.storage.local.get('clipboardPlus');
    return stored.clipboardPlus?.clips?.some((clip) => clip.content === 'Captured without a refresh');
  }, null, { timeout: 10_000 });

  console.log(JSON.stringify({
    extensionId,
    defaultCapture: 'off',
    websiteOrigins: 0,
    registeredContentScripts: 0,
    nativeMessaging: false,
    freePrivacyControls: true,
    manualClip: true,
    existingTabCapture: true,
  }, null, 2));
} finally {
  await context?.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
  await rm(profilePath, { recursive: true, force: true });
}
