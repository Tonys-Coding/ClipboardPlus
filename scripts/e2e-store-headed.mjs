// Visible-browser acceptance check. Approve the test-profile permission prompt(s),
// copy the fixture text, and press Alt+Shift+C when the console requests it.
// The profile is disposable and contains no accounts or real clipboard history.
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { assert, getServiceWorker, pollUntil } from './e2e-helpers.mjs';

const profile = await mkdtemp(join(tmpdir(), 'clipboard-plus-headed-'));
const extensionPath = resolve(import.meta.dirname, '..', 'dist');
const firstText = 'Clipboard+ headed capture before revocation';
const secondText = 'Clipboard+ headed capture after regrant';
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(`<!doctype html><title>Clipboard+ isolated acceptance fixture</title><h1>Clipboard+ test data only</h1><p>Copy each field when requested.</p><p><textarea aria-label="Before revocation" rows="3" cols="60">${firstText}</textarea></p><p><textarea aria-label="After regrant" rows="3" cols="60">${secondText}</textarea></p>`);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const worker = await getServiceWorker(context);
  const extensionId = new URL(worker.url()).hostname;
  const read = () => worker.evaluate(async () => ({
    state: (await chrome.storage.local.get('clipboardPlus')).clipboardPlus,
    granted: await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] }),
    scripts: (await chrome.scripting.getRegisteredContentScripts()).length,
  }));
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  assert(!manifest.host_permissions?.length && !manifest.permissions.includes('nativeMessaging'), 'Build the store profile first.');
  await pollUntil(async () => Boolean((await read()).state), { description: 'initial extension state' });
  const initial = await read();
  assert(!initial.granted && !initial.state.settings.autoCapture && !initial.scripts, 'Capture must start without access.');
  const fixture = await context.newPage();
  await fixture.goto(`http://127.0.0.1:${server.address().port}`);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  console.log('STEP 1: Click Enable website capture and approve the native permission prompt in this test browser.');
  await pollUntil(async () => { const value = await read(); return value.granted && value.state.settings.autoCapture && value.scripts === 1; }, { timeout: 180_000, description: 'the real optional grant and registration' });
  for (let index = 0; index < 20; index += 1) {
    assert((await read()).granted, 'The optional grant unexpectedly disappeared.');
    await new Promise((done) => setTimeout(done, 250));
  }
  await fixture.bringToFront();
  console.log('STEP 2: Copy the Before revocation field with Command+C / Control+C.');
  await pollUntil(async () => (await read()).state.clips.some((clip) => clip.content === firstText), { timeout: 180_000, description: 'capture on the already-open fixture' });
  console.log('STEP 3: Press Alt+Shift+C to open the actual extension popup.');
  await pollUntil(async () => worker.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })).some((item) => item.documentUrl?.endsWith('/popup.html'))), { timeout: 180_000, description: 'the real shortcut popup' });
  console.log('PASS: actual shortcut opened a POPUP context.');
  // Explicitly revoke the permission using the extension API, then verify cleanup.
  await worker.evaluate(() => chrome.permissions.remove({ origins: ['http://*/*', 'https://*/*'] }));
  await pollUntil(async () => { const value = await read(); return !value.granted && !value.state.settings.autoCapture && value.scripts === 0; }, { description: 'revocation handling' });
  await options.bringToFront();
  console.log('STEP 4: Re-enable Automatic web capture; approve a permission prompt if Chrome shows one.');
  await pollUntil(async () => { const value = await read(); return value.granted && value.state.settings.autoCapture && value.scripts === 1; }, { timeout: 180_000, description: 'optional permission recovery' });
  await fixture.bringToFront();
  console.log('STEP 5: Copy the After regrant field without refreshing this page.');
  await pollUntil(async () => (await read()).state.clips.some((clip) => clip.content === secondText), { timeout: 180_000, description: 'capture after regrant on the same open tab' });
  console.log(JSON.stringify({ storeProfile: true, noCaptureBeforeConsent: true, realOptionalGrant: true, sustainedGrant: true, existingTabCapture: true, realShortcutPopup: true, intentionalRevocation: true, realRegrant: true, captureRecoveredWithoutRefresh: true }));
} finally {
  await context?.close();
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true });
}
