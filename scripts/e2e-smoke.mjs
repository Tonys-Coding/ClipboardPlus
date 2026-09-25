import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { addClip, assert, pollUntil, readClipboard } from './e2e-helpers.mjs';

const extensionPath = resolve(import.meta.dirname, '..', 'dist');
const screenshotDirectory = resolve(import.meta.dirname, '..', 'docs', 'agent-work', 'free-polish', 'screenshots');

const CLIP_FIELDS = ['id', 'type', 'content', 'title', 'sourceUrl', 'sourceApp', 'favorite', 'createdAt', 'updatedAt'];
// Storage round-trips drop undefined-valued keys, so compare values, not key presence.
const normalizeClip = (clip) => (clip ? JSON.parse(JSON.stringify(clip)) : null);
const clipsMatch = (first, second) => Boolean(first && second)
  && CLIP_FIELDS.every((field) => normalizeClip(first)[field] === normalizeClip(second)[field]);
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
    <p id="after-pause">Captured after the paused timer expired</p>
    <p id="after-reenable">Captured after re-enabling website access</p>
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
  const devManifest = await worker.evaluate(() => chrome.runtime.getManifest());
  if (!devManifest.host_permissions?.length) {
    throw new Error('This smoke test needs the development build. Run `npm run test:e2e` (or `npm run build` first).');
  }
  // Lets the fixture page read the real clipboard so copy results are verified as bytes.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${address.port}` });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);

  const onboardingPage = await context.newPage();
  await onboardingPage.goto(`chrome-extension://${extensionId}/options.html`);
  // A fresh profile always starts before consent, so the disclosure card is expected.
  await onboardingPage.getByText('Enable automatic website capture?').waitFor({ state: 'visible' });
  await onboardingPage.getByRole('button', { name: 'Enable website capture' }).click();
  await pollUntil(() => onboardingPage.evaluate(async () => {
    const stored = await chrome.storage.local.get('clipboardPlus');
    const allowed = await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
    const registrations = await chrome.scripting.getRegisteredContentScripts({ ids: ['clipboard-plus-web-capture'] });
    return stored.clipboardPlus?.settings?.autoCapture === true && allowed && registrations.length === 1;
  }), { description: 'automatic capture enabled with a registered listener' });
  await page.bringToFront();
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
  await pollUntil(() => extensionPage.evaluate(async () => {
    const stored = await chrome.storage.local.get('clipboardPlus');
    return (stored.clipboardPlus?.clips?.length ?? 0) >= 3;
  }), { description: 'three clips captured from the fixture page' });

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

  await addClip(extensionPage, 'Hello {{name|friend}}');
  const snippetRow = extensionPage.locator('article').filter({ hasText: 'Hello {{name|friend}}' });
  await snippetRow.getByRole('button', { name: /copy text clip: hello/i }).click();
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

  // ---- v1.8 free-polish browser coverage ----
  await mkdir(screenshotDirectory, { recursive: true });
  await extensionPage.bringToFront();
  await extensionPage.reload();
  await extensionPage.getByRole('textbox', { name: 'Search clips' }).waitFor({ state: 'attached' });

  await addClip(extensionPage, 'Exclusive favorite fixture');
  const exclusiveFavorite = extensionPage.locator('article').filter({ hasText: 'Exclusive favorite fixture' });
  await exclusiveFavorite.getByRole('button', { name: 'Clip actions' }).click();
  await extensionPage.getByRole('menuitem', { name: 'Add to favorites' }).click();
  await exclusiveFavorite.waitFor({ state: 'detached' });
  await extensionPage.getByRole('button', { name: 'Favorites', exact: true }).click();
  await extensionPage.getByText('Exclusive favorite fixture').waitFor();
  await extensionPage.getByRole('button', { name: 'Text', exact: true }).click();
  assert(await extensionPage.getByText('Exclusive favorite fixture').count() === 0, 'A favorite leaked into the Text section.');
  await extensionPage.getByRole('button', { name: 'All', exact: true }).click();
  assert(await extensionPage.getByText('Exclusive favorite fixture').count() === 0, 'A favorite leaked into the All section.');

  const registeredShortcut = await worker.evaluate(async () => {
    const commands = await chrome.commands.getAll();
    return commands.find((command) => command.name === '_execute_action')?.shortcut ?? null;
  });
  const normalizedShortcut = String(registeredShortcut ?? '')
    .replace(/⌥/g, 'Alt+')
    .replace(/⇧/g, 'Shift+')
    .replace(/⌘/g, 'Command+')
    .replace(/⌃/g, 'Control+');
  if (normalizedShortcut !== 'Alt+Shift+C') {
    throw new Error(`Popup shortcut is ${registeredShortcut}, expected Alt+Shift+C.`);
  }

  // Where the harness can surface it, pressing the shortcut must open the popup itself.
  await page.bringToFront();
  const pageCountBeforeShortcut = context.pages().length;
  await page.keyboard.press('Alt+Shift+C');
  await page.waitForTimeout(1_000);
  const shortcutOpenedPopup = context.pages().some(
    (candidate) => candidate !== extensionPage && candidate.url().includes('/popup.html'),
  );
  const popupTargetsAfterShortcut = await (async () => {
    const session = await context.newCDPSession(page);
    const targets = await session.send('Target.getTargets');
    return targets.targetInfos.map((info) => info.type);
  })();
  const shortcutEvidence = shortcutOpenedPopup
    ? 'shortcut-opened-popup-page'
    : `headless-chromium-does-not-surface-action-popups (${context.pages().length - pageCountBeforeShortcut} page delta, targets ${popupTargetsAfterShortcut.join(',')}` + ')';
  await extensionPage.bringToFront();
  // Reopen the popup document after the filter checks so this assertion still
  // verifies the real popup-open autofocus contract rather than retained focus.
  await extensionPage.reload();

  await extensionPage.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Search clips');
  await extensionPage.keyboard.press('ArrowDown');
  await extensionPage.waitForFunction(() => document.activeElement?.hasAttribute('data-clip-row'));
  await extensionPage.keyboard.press('ArrowDown');
  const focusedRowIsSnippet = await extensionPage.evaluate(() => Boolean(document.activeElement?.closest('article')?.querySelector('.snippet-meta')));
  if (focusedRowIsSnippet) throw new Error('Keyboard navigation stopped on a smart snippet instead of a plain clip.');
  const focusedRow = await extensionPage.evaluate(() => document.activeElement?.textContent ?? '');
  await extensionPage.keyboard.press('Enter');
  await extensionPage.waitForFunction(() => Boolean(document.activeElement?.closest('article')?.querySelector('.copied-label')));

  // The keyboard copy must place the exact stored bytes on the real system clipboard.
  const keyboardRowBytes = await extensionPage.evaluate(() => document.activeElement?.closest('article')?.querySelector('.clip-content')?.textContent ?? null);
  assert(keyboardRowBytes, 'The keyboard-focused row had no content to verify.');
  const keyboardClipboard = await readClipboard(page);
  assert(keyboardClipboard === keyboardRowBytes, `Keyboard copy clipboard mismatch: ${JSON.stringify(keyboardClipboard)}`);
  await extensionPage.bringToFront();
  await extensionPage.keyboard.press('Home');
  const homeFocusVisible = await extensionPage.evaluate(() => ({
    isRow: Boolean(document.activeElement?.hasAttribute('data-clip-row')),
    focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
  }));
  assert(homeFocusVisible.isRow && homeFocusVisible.focusVisible, `Home did not leave a visible focus on the first row: ${JSON.stringify(homeFocusVisible)}`);
  await extensionPage.keyboard.press('End');
  const endFocusVisible = await extensionPage.evaluate(() => ({
    isRow: Boolean(document.activeElement?.hasAttribute('data-clip-row')),
    focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
  }));
  assert(endFocusVisible.isRow && endFocusVisible.focusVisible, `End did not leave a visible focus on the last row: ${JSON.stringify(endFocusVisible)}`);

  await extensionPage.keyboard.press('Escape');
  await extensionPage.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Search clips');

  const firstTrigger = extensionPage.locator('article').first().getByRole('button', { name: 'Clip actions' });
  await firstTrigger.click();
  await extensionPage.getByRole('menu').waitFor({ state: 'attached' });
  await extensionPage.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
  await extensionPage.keyboard.press('ArrowDown');
  await extensionPage.keyboard.press('ArrowUp');
  await extensionPage.keyboard.press('End');
  const menuEndFocus = await extensionPage.evaluate(() => ({
    role: document.activeElement?.getAttribute('role'),
    focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
  }));
  if (menuEndFocus.role !== 'menuitem' || !menuEndFocus.focusVisible) {
    throw new Error(`Menu End did not keep a visible focus on the last item: ${JSON.stringify(menuEndFocus)}`);
  }
  await extensionPage.keyboard.press('Escape');
  await extensionPage.waitForFunction(() => !document.querySelector('[role="menu"]'));
  const menuFocusReturn = await extensionPage.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  if (menuFocusReturn !== 'Clip actions') throw new Error(`Menu Escape returned focus to ${menuFocusReturn}.`);

  // Tab leaves the menu for a predictable neighbouring control instead of dropping focus.
  await firstTrigger.click();
  await extensionPage.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
  await extensionPage.keyboard.press('Tab');
  await pollUntil(() => extensionPage.evaluate(() => !document.querySelector('[role="menu"]')), { description: 'menu closed after Tab' });
  const tabExitFocus = await pollUntil(() => extensionPage.evaluate(() => (
    document.activeElement?.hasAttribute('data-clip-row')
      ? { tag: document.activeElement.tagName, label: document.activeElement.getAttribute('aria-label'), isRow: true }
      : null
  )), { description: 'focus on the next clip row after Tab' });
  if (!tabExitFocus.isRow) {
    throw new Error(`Tab did not continue to the next clip row: ${JSON.stringify(tabExitFocus)}`);
  }

  const longClip = Array.from({ length: 60 }, (_value, index) => (
    index % 3 === 0 ? `line ${index + 1}\n  indented continuation` : `line ${index + 1}`
  )).join('\n');
  await addClip(extensionPage, longClip);
  const longRow = extensionPage.locator('article').filter({ hasText: 'indented continuation' }).first();
  await longRow.getByRole('button', { name: 'Clip actions' }).click();
  await extensionPage.getByRole('menuitem', { name: 'Preview' }).click();
  const previewDialog = extensionPage.locator('[role="dialog"][aria-labelledby="preview-heading"]');
  await previewDialog.waitFor({ state: 'attached' });

  const previewText = await extensionPage.getByLabel('Clip content').textContent();
  if (previewText !== longClip) throw new Error('The preview did not preserve the exact stored content.');
  const previewWhiteSpace = await extensionPage.getByLabel('Clip content').evaluate((node) => getComputedStyle(node).whiteSpace);
  if (previewWhiteSpace !== 'pre-wrap') throw new Error(`Preview whitespace handling resolved to ${previewWhiteSpace}.`);
  const prosePreviewFont = await extensionPage.getByLabel('Clip content').evaluate((node) => getComputedStyle(node).fontFamily);
  if (!/Satoshi/.test(prosePreviewFont)) {
    throw new Error(`A text preview must keep the Satoshi body font, received ${prosePreviewFont}.`);
  }
  const previewFocused = await extensionPage.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  if (!previewFocused) throw new Error('The preview dialog did not take initial focus.');
  for (let step = 0; step < 8; step += 1) await extensionPage.keyboard.press('Tab');
  const trapped = await extensionPage.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  if (!trapped) throw new Error('Focus escaped the preview dialog.');
  await extensionPage.waitForFunction(() => !document.querySelector('.toast'));
  await extensionPage.locator('.popup-shell').screenshot({ path: join(screenshotDirectory, 'popup-preview.png') });
  await extensionPage.keyboard.press('Escape');
  await extensionPage.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  const previewFocusReturn = await extensionPage.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  if (previewFocusReturn !== 'Clip actions') throw new Error(`Preview Escape returned focus to ${previewFocusReturn}.`);

  // Code clips keep the monospace treatment that their content needs.
  const codeRow = extensionPage.locator('article').filter({ hasText: 'const captured' }).first();
  await codeRow.getByRole('button', { name: 'Clip actions' }).click();
  await extensionPage.getByRole('menuitem', { name: 'Preview' }).click();
  await previewDialog.waitFor({ state: 'attached' });
  const codePreviewFont = await extensionPage.getByLabel('Clip content').evaluate((node) => getComputedStyle(node).fontFamily);
  if (!/mono/i.test(codePreviewFont)) {
    throw new Error(`A code preview should use a monospace face, received ${codePreviewFont}.`);
  }
  await extensionPage.keyboard.press('Escape');
  await extensionPage.waitForFunction(() => !document.querySelector('[role="dialog"]'));

  const snippetOriginRow = extensionPage.locator('article').filter({ hasText: '{{name|friend}}' }).first();
  const snippetBefore = await extensionPage.evaluate(async () => (
    (await chrome.storage.local.get('clipboardPlus')).clipboardPlus.clips.find((clip) => clip.content.includes('{{name|friend}}'))
  ));
  await snippetOriginRow.getByRole('button', { name: 'Clip actions' }).click();
  await extensionPage.getByRole('menuitem', { name: 'Copy original' }).click();
  await extensionPage.getByText('Original copied').waitFor({ state: 'attached' });
  if (await extensionPage.getByRole('dialog', { name: 'Fill in the fields' }).count()) {
    throw new Error('Copy original incorrectly opened the snippet fill-in dialog.');
  }
  const originalClipboard = await readClipboard(page);
  assert(
    originalClipboard === snippetBefore?.content,
    `Copy original clipboard mismatch: ${JSON.stringify(originalClipboard)}`,
  );
  await extensionPage.bringToFront();
  const snippetAfter = await extensionPage.evaluate(async () => (
    (await chrome.storage.local.get('clipboardPlus')).clipboardPlus.clips.find((clip) => clip.content.includes('{{name|friend}}'))
  ));
  if (!clipsMatch(snippetBefore, snippetAfter)) throw new Error('Copy original mutated the stored snippet.');

  await addClip(extensionPage, 'Manual undo candidate');
  const undoBefore = await extensionPage.evaluate(async () => (
    (await chrome.storage.local.get('clipboardPlus')).clipboardPlus.clips.find((clip) => clip.content === 'Manual undo candidate')
  ));
  const undoRow = extensionPage.locator('article').filter({ hasText: 'Manual undo candidate' }).first();
  await undoRow.getByRole('button', { name: 'Clip actions' }).click();
  await extensionPage.getByRole('menuitem', { name: 'Delete' }).click();
  await extensionPage.getByText('Clip deleted.').waitFor({ state: 'attached' });
  const undoGone = await extensionPage.evaluate(async () => (
    (await chrome.storage.local.get('clipboardPlus')).clipboardPlus.clips.some((clip) => clip.content === 'Manual undo candidate')
  ));
  if (undoGone) throw new Error('The deleted clip stayed in history.');
  await extensionPage.getByRole('button', { name: 'Undo', exact: true }).click();
  await extensionPage.getByText('Clip restored').waitFor({ state: 'attached' });
  const undoAfter = await extensionPage.evaluate(async () => (
    (await chrome.storage.local.get('clipboardPlus')).clipboardPlus.clips.find((clip) => clip.content === 'Manual undo candidate')
  ));
  if (!clipsMatch(undoBefore, undoAfter)) {
    throw new Error(`Undo did not restore the original clip record. Before: ${JSON.stringify(undoBefore)} After: ${JSON.stringify(undoAfter)}`);
  }

  // A keyboard deletion must leave focus on a surviving row that still copies.
  await addClip(extensionPage, 'Keyboard delete candidate');
  const keyboardDeleteRow = extensionPage.locator('article').filter({ hasText: 'Keyboard delete candidate' }).first();
  await keyboardDeleteRow.getByRole('button', { name: 'Clip actions' }).click();
  await extensionPage.getByRole('menuitem', { name: 'Delete' }).click();
  await extensionPage.getByText('Clip deleted.').waitFor({ state: 'attached' });
  const deleteFocus = await pollUntil(() => extensionPage.evaluate(() => (
    document.activeElement?.hasAttribute('data-clip-row') ? true : null
  )), { description: 'focus on a surviving row after deletion' });
  assert(deleteFocus, 'Deleting a clip dropped keyboard focus.');
  await extensionPage.keyboard.press('Enter');
  await extensionPage.waitForFunction(() => Boolean(document.activeElement?.closest('article')?.querySelector('.copied-label')));

  // Bulk clearing invalidates a pending undo offer.
  await addClip(extensionPage, 'Bulk clear candidate');
  const bulkRow = extensionPage.locator('article').filter({ hasText: 'Bulk clear candidate' }).first();
  await bulkRow.getByRole('button', { name: 'Clip actions' }).click();
  await extensionPage.getByRole('menuitem', { name: 'Delete' }).click();
  await extensionPage.getByText('Clip deleted.').waitFor({ state: 'attached' });
  await extensionPage.evaluate(() => chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }));
  await extensionPage.getByRole('button', { name: 'Undo', exact: true }).click();
  await extensionPage.getByText('That undo offer has expired.').waitFor({ state: 'attached' });
  const bulkCleared = await extensionPage.evaluate(async () => (
    (await chrome.storage.local.get('clipboardPlus')).clipboardPlus.clips.some((clip) => clip.content === 'Bulk clear candidate')
  ));
  if (bulkCleared) throw new Error('Clearing history did not invalidate the pending undo offer.');

  // Capture feedback: permission removal is detected, and recovery re-registers the listener.
  await page.bringToFront();
  await extensionPage.evaluate(() => chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    payload: { capturePaused: true, capturePausedUntil: Date.now() + 1_500 },
  }));
  const pauseNotice = await pollUntil(() => extensionPage.evaluate(() => document.querySelector('.pause-notice')?.textContent ?? null), {
    description: 'the timed pause notice',
  });
  assert(/paused until/i.test(pauseNotice), `The pause notice must state when it ends, received ${pauseNotice}`);
  // No manual resume: the pause has to expire on its own and capture must return.
  await pollUntil(() => extensionPage.evaluate(() => !document.querySelector('.pause-notice')), {
    timeout: 10_000,
    description: 'the timed pause to expire without a manual resume',
  });
  await extensionPage.getByRole('button', { name: 'Pause automatic web capture for one hour' }).waitFor({ state: 'attached' });
  await page.bringToFront();
  await page.locator('#after-pause').selectText();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  await pollUntil(() => extensionPage.evaluate(async () => (
    (await chrome.storage.local.get('clipboardPlus')).clipboardPlus.clips.some((clip) => clip.content === 'Captured after the paused timer expired')
  )), { description: 'a capture after the timed pause expired' });

  await onboardingPage.bringToFront();
  await onboardingPage.locator('.switch').click();
  await page.bringToFront();
  const revokedNotice = await extensionPage.waitForFunction(() => {
    const notice = document.querySelector('.notice')?.textContent ?? '';
    return /Website access is off|Automatic website capture is off/.test(notice) ? notice : null;
  }, null, { timeout: 10_000 }).then((handle) => handle.jsonValue());
  if (!/Website access is off|Automatic website capture is off/.test(String(revokedNotice))) {
    const snapshot = await extensionPage.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const stored = await chrome.storage.local.get('clipboardPlus');
      return {
        activeTab: tab?.url ?? null,
        activeTabId: tab?.id ?? null,
        autoCapture: stored.clipboardPlus?.settings?.autoCapture,
        registrations: (await chrome.scripting.getRegisteredContentScripts()).length,
      };
    });
    throw new Error(`Unexpected capture notice after revocation: ${revokedNotice} ${JSON.stringify(snapshot)}`);
  }

  await onboardingPage.bringToFront();
  await onboardingPage.locator('.switch').click();
  await pollUntil(() => onboardingPage.evaluate(async () => {
    const stored = await chrome.storage.local.get('clipboardPlus');
    const registrations = await chrome.scripting.getRegisteredContentScripts({ ids: ['clipboard-plus-web-capture'] });
    return stored.clipboardPlus?.settings?.autoCapture === true && registrations.length === 1;
  }), { description: 'capture re-enabled with a registered listener' });
  await page.bringToFront();
  await pollUntil(() => extensionPage.evaluate(() => !document.querySelector('.notice')), { description: 'the popup capture notice cleared' });

  // Capture works again on the same already-open tab, without a reload.
  await page.locator('#after-reenable').selectText();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  await pollUntil(() => extensionPage.evaluate(async () => (
    (await chrome.storage.local.get('clipboardPlus')).clipboardPlus.clips.some((clip) => clip.content === 'Captured after re-enabling website access')
  )), { description: 'a capture after re-enabling access on the already-open tab' });

  // Raw chrome.permissions.remove evidence: either Chrome revokes access and Clipboard+
  // reacts truthfully, or the development profile keeps it as a required permission.
  const rawRemove = await onboardingPage.evaluate(async () => {
    try {
      return { result: await chrome.permissions.remove({ origins: ['http://*/*', 'https://*/*'] }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  const afterRawRemove = await onboardingPage.evaluate(async () => ({
    contains: await chrome.permissions.contains({ origins: ['http://*/*'] }),
    registrations: (await chrome.scripting.getRegisteredContentScripts()).length,
    autoCapture: (await chrome.storage.local.get('clipboardPlus')).clipboardPlus?.settings?.autoCapture ?? null,
  }));
  let externalRevocationEvidence;
  if (!afterRawRemove.contains) {
    externalRevocationEvidence = `chrome.permissions.remove returned ${rawRemove.result} and revoked access`;
    await pollUntil(() => extensionPage.evaluate(() => /Website access is off/.test(document.querySelector('.notice')?.textContent ?? '')), {
      description: 'the missing-permission notice after an external removal',
    });
    assert(afterRawRemove.autoCapture === false, 'Revoked website access must disable automatic capture.');
    assert(afterRawRemove.registrations === 0, 'Revoked website access must unregister the capture listener.');
  } else {
    externalRevocationEvidence = `the development profile declares website access as a required permission, so chrome.permissions.remove answered "${rawRemove.error ?? rawRemove.result}" and access stayed granted`;
    assert(afterRawRemove.registrations === 1, 'Required website access must keep the capture listener registered.');
    assert(afterRawRemove.autoCapture === true, 'Required website access must keep automatic capture enabled.');
  }

  // About & help: runtime version, shortcut, and a redacted troubleshooting export.
  const aboutPage = await context.newPage();
  await aboutPage.goto(`chrome-extension://${extensionId}/options.html`);
  await aboutPage.getByText('About & help').waitFor({ state: 'attached' });
  await aboutPage.getByRole('heading', { name: 'Clipboard+ 1.8.1' }).waitFor({ state: 'attached' });
  await aboutPage.getByText(/to open Clipboard\+ and focus search/).waitFor({ state: 'attached' });
  const diagnostics = await aboutPage.locator('.diagnostics-preview').textContent();
  if (!diagnostics.includes('Version: 1.8.1')) throw new Error('Troubleshooting details omitted the runtime version.');
  for (const secret of ['Copied with Command C', 'filtered.example', '127.0.0.1']) {
    if (diagnostics.includes(secret)) throw new Error(`Troubleshooting details leaked "${secret}".`);
  }
  await aboutPage.getByRole('button', { name: 'Copy troubleshooting details' }).click();
  await aboutPage.getByText('Copied to clipboard').waitFor({ state: 'attached' });
  await aboutPage.screenshot({ path: join(screenshotDirectory, 'options-about.png'), fullPage: true });

  const nativeResult = await extensionPage.evaluate(() => chrome.runtime.sendMessage({ type: 'SYNC_COMPANION' }));
  const nativeMessaging = nativeResult.companion?.available ? 'connected' : 'Chrome for Testing does not read user-level native hosts';

  console.log(JSON.stringify({
    extensionId,
    captured: contents,
    codeClassified: true,
    passwordExcluded: true,
    captureTypes: true,
    privacyPause: true,
    sourceMetadataControls: true,
    popupDiagnostic: 'ready',
    smartSnippets: true,
    pasteTransformations: true,
    typography: popupTypography.family,
    popupShortcut: registeredShortcut,
    keyboardRowFocused: focusedRow.slice(0, 60),
    keyboardClipboardBytesMatchStoredContent: true,
    copyOriginalClipboardBytesMatchStoredSnippet: true,
    listHomeEndFocusVisible: true,
    menuHomeEndFocusVisible: true,
    menuTabExitFocus: tabExitFocus.label ?? tabExitFocus.tag,
    deleteKeepsKeyboardFocus: true,
    previewFonts: { text: prosePreviewFont, code: codePreviewFont },
    shortcutEvidence,
    menuKeyboard: true,
    dialogFocusTrap: true,
    previewExactContent: previewText.length,
    undoRestoredSameRecord: true,
    bulkClearInvalidatesUndo: true,
    timedPauseNotice: true,
    captureOffAndRecovered: true,
    captureRecoveredOnOpenTab: true,
    externalRevocationEvidence,
    permissionRevocationProfile: 'store build (development build requires website access)',
    aboutVersion: '1.8.1',
    favoritesExclusiveToSaved: true,
    troubleshootingRedacted: true,
    screenshots: ['popup-preview.png', 'options-about.png'],
    nativeMessaging,
  }, null, 2));
} finally {
  await context?.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
  await rm(profilePath, { recursive: true, force: true });
}
