import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { addClip, assert, getServiceWorker, pollUntil, readClipboard } from './e2e-helpers.mjs';

const extensionPath = resolve(import.meta.dirname, '..', 'dist');
const profilePath = await mkdtemp(join(tmpdir(), 'clipboard-plus-store-e2e-'));
const FIXTURE_TEXT = 'Captured without a refresh';

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(`<!doctype html><html><head><title>Existing tab</title></head><body><p id="copy-me">${FIXTURE_TEXT}</p></body></html>`);
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not start the store smoke-test page.');
const fixtureOrigin = `http://127.0.0.1:${address.port}`;
let context;

const storedState = (page) => page.evaluate(async () => (await chrome.storage.local.get('clipboardPlus')).clipboardPlus);

try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: fixtureOrigin });
  const worker = await getServiceWorker(context);
  const extensionId = new URL(worker.url()).host;
  const storeManifest = await worker.evaluate(() => chrome.runtime.getManifest());
  if (storeManifest.host_permissions?.length || storeManifest.permissions?.includes('nativeMessaging')) {
    throw new Error('This smoke test needs the store build. Run `npm run test:e2e:store` (or `npm run build:store` first).');
  }

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByText('Enable automatic website capture?').waitFor();

  // --- A fresh store install must not have any capture access before consent ---
  const initial = await options.evaluate(async () => ({
    state: (await chrome.storage.local.get('clipboardPlus')).clipboardPlus,
    allowed: await chrome.permissions.getAll(),
    registrations: await chrome.scripting.getRegisteredContentScripts(),
    manifest: chrome.runtime.getManifest(),
  }));
  assert(initial.state.settings.autoCapture === false, 'Fresh store installs must not capture automatically.');
  assert(initial.state.settings.retentionDays === 0, 'Fresh store installs must keep clips indefinitely by default.');
  assert(initial.state.settings.captureTypes.join(',') === 'text,url,code', 'Fresh store installs must enable every capture category.');
  assert(initial.state.settings.capturePaused === false, 'Fresh store installs must not begin paused.');
  assert(!initial.allowed.origins?.length, 'Fresh store installs must not have website access.');
  assert(initial.registrations.length === 0, 'Fresh store installs must not register a content script.');
  assert(!initial.manifest.permissions?.includes('nativeMessaging'), 'The store manifest includes Native Messaging.');
  assert(!initial.manifest.host_permissions?.length, 'The store manifest includes required website access.');

  const fixture = await context.newPage();
  await fixture.goto(fixtureOrigin);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: /add clip/i }).waitFor();

  // --- Every free popup flow works with no website access at all ---
  await addClip(popup, 'Manual store-profile clip');
  await addClip(popup, 'Hello {{name|friend}} from the store build');
  const snippetRow = popup.locator('article').filter({ hasText: '{{name|friend}}' }).first();
  await snippetRow.waitFor();
  await snippetRow.getByRole('button', { name: /copy text clip: hello/i }).click();
  await popup.getByRole('dialog', { name: 'Fill in the fields' }).waitFor();
  await popup.getByRole('textbox', { name: 'name' }).fill('Sam');
  await popup.getByRole('button', { name: 'Copy snippet' }).click();
  await popup.getByText('Snippet copied').waitFor();
  const snippetClipboard = await readClipboard(fixture);
  assert(snippetClipboard === 'Hello Sam from the store build', `The store build copied the wrong snippet bytes: ${JSON.stringify(snippetClipboard)}`);
  await popup.bringToFront();

  const manualRow = popup.locator('article').filter({ hasText: 'Manual store-profile clip' }).first();
  await manualRow.getByRole('button', { name: 'Clip actions' }).click();
  await popup.getByRole('menuitem', { name: 'Preview' }).click();
  const previewBody = popup.getByLabel('Clip content');
  await previewBody.waitFor({ state: 'attached' });
  const previewText = await previewBody.textContent();
  assert(previewText === 'Manual store-profile clip', `Preview must show the exact stored text, received ${JSON.stringify(previewText)}.`);
  const previewFont = await previewBody.evaluate((node) => getComputedStyle(node).fontFamily);
  assert(/Satoshi/.test(previewFont), `Text previews must keep the body font, received ${previewFont}.`);
  await popup.keyboard.press('Escape');
  await popup.waitForFunction(() => !document.querySelector('[role="dialog"]'));

  await manualRow.getByRole('button', { name: 'Clip actions' }).click();
  await popup.getByRole('menuitem', { name: 'Transform & copy' }).click();
  await popup.getByRole('button', { name: /uppercase/i }).click();
  await popup.getByRole('button', { name: 'Copy result' }).click();
  await popup.getByText('Transformed copy ready').waitFor();

  const beforeDelete = await storedState(popup);
  const manualClip = beforeDelete.clips.find((clip) => clip.content === 'Manual store-profile clip');
  assert(manualClip, 'The manual clip was not stored.');
  await manualRow.getByRole('button', { name: 'Clip actions' }).click();
  await popup.getByRole('menuitem', { name: 'Delete' }).click();
  await popup.getByText('Clip deleted.').waitFor();
  await popup.getByRole('button', { name: 'Undo', exact: true }).click();
  await popup.getByText('Clip restored').waitFor();
  const restoredClip = (await storedState(popup)).clips.find((clip) => clip.content === 'Manual store-profile clip');
  assert(
    Boolean(restoredClip) && restoredClip.id === manualClip.id && restoredClip.createdAt === manualClip.createdAt,
    'Undo must restore the original record in the store build.',
  );

  // --- About & help works without any website access ---
  const aboutPage = await context.newPage();
  await aboutPage.goto(`chrome-extension://${extensionId}/options.html`);
  await aboutPage.getByText('About & help').waitFor({ state: 'attached' });
  await aboutPage.getByRole('heading', { name: 'Clipboard+ 1.8.1' }).waitFor({ state: 'attached' });
  const diagnostics = await aboutPage.locator('.diagnostics-preview').textContent();
  assert(diagnostics.includes('Website access granted: no'), 'Troubleshooting details must report missing website access.');
  for (const secret of ['Manual store-profile clip', '{{name|friend}}', fixtureOrigin]) {
    assert(!diagnostics.includes(secret), `Troubleshooting details leaked "${secret}".`);
  }
  await aboutPage.getByRole('button', { name: 'Copy troubleshooting details' }).click();
  await aboutPage.locator('.diagnostics-feedback').filter({ hasText: 'Copied to clipboard' }).waitFor();
  const diagnosticsClipboard = await readClipboard(fixture);
  assert(diagnosticsClipboard.startsWith('Clipboard+ troubleshooting details'), 'The troubleshooting copy must reach the clipboard.');

  // --- The optional website grant must never be assumed in this environment ---
  await fixture.bringToFront();
  await options.bringToFront();
  await options.getByRole('button', { name: 'Enable website capture' }).click();
  const enableTimeline = [];
  const enableDeadline = Date.now() + 8_000;
  while (Date.now() < enableDeadline) {
    const snapshot = await options.evaluate(async () => {
      const stored = await chrome.storage.local.get('clipboardPlus');
      return {
        granted: await chrome.permissions.contains({ origins: ['http://*/*'] }),
        autoCapture: stored.clipboardPlus?.settings?.autoCapture ?? null,
        registrations: (await chrome.scripting.getRegisteredContentScripts()).length,
      };
    });
    enableTimeline.push(snapshot);
    if (snapshot.granted || snapshot.autoCapture) break;
    await new Promise((delay) => setTimeout(delay, 500));
  }
  const grantedDuringEnable = enableTimeline.some((entry) => entry.granted || entry.autoCapture === true);
  assert(!grantedDuringEnable, `Clipboard+ must never grant website access by itself: ${JSON.stringify(enableTimeline.at(-1))}`);
  assert(enableTimeline.every((entry) => entry.registrations === 0), 'No capture listener may register without granted website access.');

  const promptTargets = await (async () => {
    const session = await context.newCDPSession(options);
    const targets = await session.send('Target.getTargets');
    return targets.targetInfos.map((info) => info.type);
  })();
  const optionalGrantEvidence = `chrome.permissions.request stayed pending for ${enableTimeline.length} samples over 8s with no prompt target in headless Chromium (targets: ${promptTargets.join(', ')})`;

  // Capture must stay impossible while access is missing, even in an already-open tab.
  await fixture.bringToFront();
  await fixture.locator('#copy-me').selectText();
  await fixture.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  await new Promise((delay) => setTimeout(delay, 1_000));
  const contentsWithoutAccess = (await storedState(popup)).clips.map((clip) => clip.content);
  assert(!contentsWithoutAccess.includes(FIXTURE_TEXT), 'A page copy was stored without granted website access.');

  // The popup must describe that state truthfully instead of claiming an active capture.
  await popup.bringToFront();
  await pollUntil(() => popup.evaluate(() => Boolean(document.querySelector('.notice'))), {
    description: 'an accurate capture notice without website access',
  });
  const popupNotice = await popup.evaluate(() => document.querySelector('.notice')?.textContent ?? '');
  assert(
    /Website access is off|Automatic website capture is off/.test(popupNotice),
    `The store popup must report missing access truthfully, received: ${popupNotice}`,
  );

  // Removing access that was never granted must not create a false state either.
  const removeWithoutGrant = await options.evaluate(() => chrome.permissions.remove({ origins: ['http://*/*', 'https://*/*'] }));
  const afterRemove = await options.evaluate(async () => ({
    granted: await chrome.permissions.contains({ origins: ['http://*/*'] }),
    autoCapture: (await chrome.storage.local.get('clipboardPlus')).clipboardPlus?.settings?.autoCapture ?? null,
  }));
  assert(afterRemove.granted === false, 'Removing ungranted website access must leave access absent.');
  assert(afterRemove.autoCapture === false, 'Removing ungranted website access must not enable capture.');

  console.log(JSON.stringify({
    extensionId,
    defaultCapture: 'off',
    websiteOrigins: 0,
    registeredContentScripts: 0,
    nativeMessaging: false,
    noGrantBeforeConsent: true,
    manualClipFlows: true,
    undoRestoredRecord: true,
    previewTypography: previewFont,
    troubleshootingRedacted: true,
    capturedWithoutAccess: false,
    popupCaptureNotice: popupNotice,
    permissionRemoveWithoutGrant: removeWithoutGrant,
    optionalGrantEvidence,
  }, null, 2));
} finally {
  await context?.close();
  await new Promise((closed) => server.close(closed));
  await rm(profilePath, { recursive: true, force: true });
}
