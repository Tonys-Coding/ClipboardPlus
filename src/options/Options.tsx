import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckIcon, ClipboardIcon, PlusIcon, TrashIcon, XIcon } from '../components/Icons';
import { CAPTURE_CONSENT_VERSION, STORAGE_KEY, captureIsPaused, normalizeHostname } from '../lib/clips';
import { COMPANION_ENABLED } from '../lib/build';
import { buildTroubleshootingReport } from '../lib/diagnostics';
import { hasCurrentCaptureConsent, hasWebsiteAccess, removeWebsiteAccess, requestWebsiteAccess } from '../lib/capturePermissions';
import { sendMessage } from '../lib/runtime';
import type { ClipType, RetentionDays, Settings, StorageState } from '../lib/types';
import { TypeGlyph } from '../popup/TypeGlyph';
import './options.css';

const CAPTURE_TYPE_OPTIONS: Array<{ type: ClipType; label: string; detail: string }> = [
  { type: 'text', label: 'Text', detail: 'Notes, messages, and ordinary selections' },
  { type: 'url', label: 'Links', detail: 'Complete web addresses' },
  { type: 'code', label: 'Code', detail: 'Recognizable code and structured data' },
];

const CAPTURE_SCRIPT_ID = 'clipboard-plus-web-capture';
const SHORTCUT_SETTINGS_URL = 'chrome://extensions/shortcuts';
const RELEASE_NOTES_URL = 'https://tonys-coding.github.io/ClipboardPlus/release-notes.html';
const SUPPORT_URL = 'https://tonys-coding.github.io/ClipboardPlus/support.html';

interface AboutStatus {
  state: StorageState | null;
  stateError: string;
  websiteAccess: boolean | null;
  listenerRegistered: boolean | null;
  shortcut: string | null;
  shortcutKnown: boolean;
  manifestVersion: string;
}

async function readWebsiteAccess(): Promise<boolean | null> {
  try {
    return await hasWebsiteAccess();
  } catch {
    return null;
  }
}

async function readListenerRegistration(): Promise<boolean | null> {
  try {
    const registrations = await chrome.scripting?.getRegisteredContentScripts?.({ ids: [CAPTURE_SCRIPT_ID] });
    return Boolean(registrations?.length);
  } catch {
    return null;
  }
}

async function readShortcut(): Promise<{ shortcut: string | null; known: boolean }> {
  try {
    const commands = (await chrome.commands?.getAll?.()) ?? [];
    return {
      shortcut: commands.find((command) => command.name === '_execute_action')?.shortcut || null,
      known: true,
    };
  } catch {
    return { shortcut: null, known: false };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortcutStatusText(shortcut: string | null, shortcutKnown: boolean): string {
  if (!shortcutKnown) {
    return "Shortcut status is unavailable right now. Open Chrome's shortcut settings to check the current combination.";
  }
  if (shortcut) return `Press ${shortcut} to open Clipboard+ and focus search.`;
  return 'No shortcut is currently assigned. Chrome leaves suggested shortcuts unassigned when another extension already uses the same combination.';
}

function pauseDescription(settings: Settings): string {
  if (!captureIsPaused(settings)) return 'Automatic website capture is currently available.';
  if (settings.capturePausedUntil === null) return 'Paused until you resume it.';
  return `Paused until ${new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(settings.capturePausedUntil)}.`;
}

export function Options() {
  const [state, setState] = useState<StorageState | null>(null);
  const [site, setSite] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [companionOnline, setCompanionOnline] = useState(false);
  const [websiteAccess, setWebsiteAccess] = useState(false);
  const [pausePreset, setPausePreset] = useState('15');
  const [shortcut, setShortcut] = useState<string | null>(null);
  const [shortcutKnown, setShortcutKnown] = useState(true);
  const [listenerRegistered, setListenerRegistered] = useState<boolean | null>(null);
  const [manifestVersion, setManifestVersion] = useState('unknown');
  const [diagnosticsFeedback, setDiagnosticsFeedback] = useState<'idle' | 'checking' | 'copied' | 'error'>('idle');
  const [diagnosticsMessage, setDiagnosticsMessage] = useState('');
  const buildProfile = COMPANION_ENABLED ? 'development' : 'store';

  const collectStatus = useCallback(async (): Promise<AboutStatus> => {
    let currentState: StorageState | null = null;
    let stateError = '';
    try {
      const response = await sendMessage({ type: 'GET_STATE' });
      currentState = response.state ?? null;
      if (!currentState) stateError = 'Clipboard+ returned no saved settings.';
    } catch (reason) {
      stateError = reason instanceof Error ? reason.message : 'Clipboard+ could not read its current settings.';
    }

    const { shortcut: shortcutValue, known: shortcutReadable } = await readShortcut();

    let version = 'unknown';
    try {
      version = chrome.runtime?.getManifest?.().version ?? 'unknown';
    } catch {
      version = 'unknown';
    }

    return {
      state: currentState,
      stateError,
      websiteAccess: await readWebsiteAccess(),
      listenerRegistered: await readListenerRegistration(),
      shortcut: shortcutValue,
      shortcutKnown: shortcutReadable,
      manifestVersion: version,
    };
  }, []);

  const applyStatus = useCallback((status: AboutStatus) => {
    if (status.state) setState(status.state);
    setWebsiteAccess(status.websiteAccess === true);
    setShortcut(status.shortcut);
    setShortcutKnown(status.shortcutKnown);
    setListenerRegistered(status.listenerRegistered);
    setManifestVersion(status.manifestVersion);
    if (status.stateError) setError(status.stateError);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await sendMessage({ type: COMPANION_ENABLED ? 'SYNC_COMPANION' : 'GET_STATE' });
        if (response.state) setState(response.state);
        setCompanionOnline(Boolean(response.companion?.available));
        setWebsiteAccess(Boolean(response.permissions?.websiteAccess));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not load Clipboard+ settings.');
      }
      // The About section always reflects live status instead of the first render.
      applyStatus(await collectStatus());
    })();
  }, [applyStatus, collectStatus]);

  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    const moveSpotlight = (event: PointerEvent) => {
      if (reducedMotion?.matches || event.pointerType === 'touch') return;
      root.style.setProperty('--spotlight-x', `${event.clientX}px`);
      root.style.setProperty('--spotlight-y', `${Math.max(170, Math.min(event.clientY, window.innerHeight - 90))}px`);
    };

    window.addEventListener('pointermove', moveSpotlight, { passive: true });
    return () => {
      window.removeEventListener('pointermove', moveSpotlight);
      root.style.removeProperty('--spotlight-x');
      root.style.removeProperty('--spotlight-y');
    };
  }, []);

  useEffect(() => {
    const refreshLive = () => {
      void readWebsiteAccess().then((access) => {
        if (access !== null) setWebsiteAccess(access);
      });
      void readListenerRegistration().then(setListenerRegistered);
      void readShortcut().then(({ shortcut: value, known }) => {
        setShortcut(value);
        setShortcutKnown(known);
      });
    };
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      const next = changes[STORAGE_KEY]?.newValue;
      if (next) setState(next as StorageState);
      refreshLive();
    };
    const onPermissions = () => refreshLive();
    const added = chrome.permissions.onAdded as chrome.events.Event<typeof onPermissions> | undefined;
    const removed = chrome.permissions.onRemoved as chrome.events.Event<typeof onPermissions> | undefined;
    chrome.storage.onChanged.addListener(onStorage);
    added?.addListener(onPermissions);
    removed?.addListener(onPermissions);
    window.addEventListener('focus', refreshLive);
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      added?.removeListener(onPermissions);
      removed?.removeListener(onPermissions);
      window.removeEventListener('focus', refreshLive);
    };
  }, []);

  const update = async (changes: Partial<Settings>) => {
    try {
      const response = await sendMessage({ type: 'UPDATE_SETTINGS', payload: changes });
      if (response.state) setState(response.state);
      setListenerRegistered(await readListenerRegistration());
      setSaved(true);
      setError('');
      window.setTimeout(() => setSaved(false), 1500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save settings.');
    }
  };

  const enableCapture = async () => {
    try {
      const granted = await requestWebsiteAccess();
      if (!granted) {
        setError('Website access was not granted. Clipboard+ will remain available for manual clips and saved tabs.');
        return;
      }
      const response = await sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: {
          autoCapture: true,
          captureConsentVersion: CAPTURE_CONSENT_VERSION,
          captureConsentAt: Date.now(),
        },
      });
      if (response.state) setState(response.state);
      setWebsiteAccess(true);
      // Registration completes after the storage notification, so re-read after the reply.
      setListenerRegistered(await readListenerRegistration());
      setSaved(true);
      setError('');
      window.setTimeout(() => setSaved(false), 1500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not enable automatic capture.');
    }
  };

  const disableCapture = async () => {
    try {
      const response = await sendMessage({ type: 'UPDATE_SETTINGS', payload: { autoCapture: false } });
      if (response.state) setState(response.state);
      await removeWebsiteAccess();
      setWebsiteAccess(false);
      setListenerRegistered(await readListenerRegistration());
      setSaved(true);
      setError('');
      window.setTimeout(() => setSaved(false), 1500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not disable automatic capture.');
    }
  };

  const continueWithoutCapture = async () => {
    await update({ autoCapture: false, captureConsentVersion: CAPTURE_CONSENT_VERSION });
  };

  const addSite = (event: FormEvent) => {
    event.preventDefault();
    const hostname = normalizeHostname(site);
    if (!hostname) { setError('Enter a valid site, such as example.com.'); return; }
    if (!state) return;
    void update({ excludedSites: [...state.settings.excludedSites, hostname] });
    setSite('');
  };

  const clear = async (all: boolean) => {
    const message = all
      ? 'Delete every clip, including favorites? This cannot be undone.'
      : 'Delete all non-favorite history? Your favorites will stay saved.';
    if (!window.confirm(message)) return;
    const response = await sendMessage({ type: all ? 'CLEAR_ALL' : 'CLEAR_HISTORY' });
    if (response.state) setState(response.state);
  };

  const setRetention = async (retentionDays: RetentionDays) => {
    if (!state) return;
    const cutoff = retentionDays ? Date.now() - retentionDays * 24 * 60 * 60 * 1000 : 0;
    const expiring = retentionDays
      ? state.clips.filter((clip) => !clip.favorite && clip.updatedAt < cutoff).length
      : 0;
    if (expiring && !window.confirm(`${expiring} expired clip${expiring === 1 ? '' : 's'} will be deleted now. Favorites will stay saved.`)) return;
    await update({ retentionDays });
  };

  const toggleCaptureType = async (type: ClipType) => {
    if (!state) return;
    const enabled = state.settings.captureTypes.includes(type);
    const captureTypes = enabled
      ? state.settings.captureTypes.filter((item) => item !== type)
      : [...state.settings.captureTypes, type];
    if (!captureTypes.length) return;
    await update({ captureTypes });
  };

  const pauseCapture = async () => {
    const now = Date.now();
    let capturePausedUntil: number | null;
    if (pausePreset === 'indefinite') capturePausedUntil = null;
    else if (pausePreset === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      capturePausedUntil = tomorrow.getTime();
    } else capturePausedUntil = now + Number(pausePreset) * 60 * 1000;
    await update({ capturePaused: true, capturePausedUntil });
  };

  const announceDiagnostics = (message: string) => {
    setDiagnosticsMessage('');
    window.setTimeout(() => setDiagnosticsMessage(message), 60);
  };

  const copyTroubleshooting = async () => {
    setDiagnosticsFeedback('checking');
    announceDiagnostics('Checking your current Clipboard+ status.');
    // Every copy re-reads the live status so the report cannot describe a stale state.
    const status = await collectStatus();
    applyStatus(status);

    if (!status.state) {
      setDiagnosticsFeedback('error');
      announceDiagnostics(`${status.stateError || 'Clipboard+ could not read its current status.'} Nothing was copied.`);
      return;
    }

    const report = buildTroubleshootingReport({
      manifestVersion: status.manifestVersion,
      buildProfile,
      captureEnabled: status.state.settings.autoCapture,
      capturePaused: captureIsPaused(status.state.settings),
      consentCurrent: hasCurrentCaptureConsent(status.state.settings),
      websiteAccessGranted: status.websiteAccess,
      captureListenerRegistered: status.listenerRegistered,
    });

    try {
      await navigator.clipboard.writeText(report);
      setDiagnosticsFeedback('copied');
      announceDiagnostics('Troubleshooting details copied to your clipboard.');
    } catch {
      setDiagnosticsFeedback('error');
      announceDiagnostics('Clipboard access was blocked, so nothing was copied. Click the button again.');
    }
    window.setTimeout(() => setDiagnosticsFeedback('idle'), 3_500);
  };

  if (!state) return <main className="options-shell"><div className="options-loading">{error || 'Loading Clipboard+…'}</div></main>;

  return (
    <main className="options-shell">
      <div className="spotlight-stage" aria-hidden="true">
        <span className="spotlight-fixture" />
        <span className="spotlight-beam" />
        <span className="spotlight-pool" />
      </div>
      <aside className="floating-clipboards floating-left" aria-hidden="true">
        <img className="floating-clipboard clipboard-one" src="/assets/clipboard-plus-single.png" alt="" />
        <img className="floating-clipboard clipboard-two" src="/assets/clipboard-plus-single.png" alt="" />
        <img className="floating-clipboard clipboard-three" src="/assets/clipboard-plus-single.png" alt="" />
        <span className="clipboard-trail trail-one" />
        <span className="clipboard-trail trail-two" />
      </aside>
      <aside className="floating-clipboards floating-right" aria-hidden="true">
        <img className="floating-clipboard clipboard-one" src="/assets/clipboard-plus-single.png" alt="" />
        <img className="floating-clipboard clipboard-two" src="/assets/clipboard-plus-single.png" alt="" />
        <img className="floating-clipboard clipboard-three" src="/assets/clipboard-plus-single.png" alt="" />
        <span className="clipboard-trail trail-one" />
        <span className="clipboard-trail trail-two" />
      </aside>
      <header className="options-header">
        <img className="options-logo" src="/icons/clipboard-plus-logo.png" alt="Clipboard+ logo" />
        <div><h1>Capture controls</h1><p>Choose what Clipboard+ collects and keeps on this device.</p></div>
        {saved && <span className="saved-badge"><CheckIcon /> Saved</span>}
      </header>

      {error && <div className="error-banner">{error}<button type="button" onClick={() => setError('')}><XIcon /></button></div>}

      {state.settings.captureConsentVersion < CAPTURE_CONSENT_VERSION && (
        <section className="settings-card consent-card" aria-labelledby="capture-consent-heading">
          <span className="consent-kicker">Your choice</span>
          <h2 id="capture-consent-heading">Enable automatic website capture?</h2>
          <p>Clipboard+ can save text, links, recognizable code, page titles, and source URLs when you copy on websites you authorize. Everything stays in Chrome's local extension storage and is never uploaded.</p>
          <ul>
            <li>Password fields and recognized authentication and payment fields are ignored.</li>
            <li>You can exclude sites, revoke website access, or clear your history at any time.</li>
            <li>Manual clips and Save tab work without automatic capture.</li>
          </ul>
          <div className="consent-actions">
            <button type="button" className="consent-secondary" onClick={() => void continueWithoutCapture()}>Continue without capture</button>
            <button type="button" className="consent-primary" onClick={() => void enableCapture()}>Enable website capture</button>
          </div>
        </section>
      )}

      {COMPANION_ENABLED && <section className="settings-card companion-card">
        <div>
          <h2>Quick Paste</h2>
          <p>Press ⌃⇧V anywhere to search your favorites and recent clips. Return pastes into the previous app; ⌘Return copies without pasting.</p>
        </div>
        <span className={`connection-badge ${companionOnline ? 'online' : ''}`}><span />{companionOnline ? 'Connected' : 'Offline'}</span>
      </section>}

      <section className="settings-card">
        <div className="setting-row">
          <div><h2>Automatic web capture</h2><p>{websiteAccess && state.settings.autoCapture ? 'Enabled for authorized websites.' : 'Off. Manual clips and Save tab remain available.'}</p></div>
          <label className="switch"><input type="checkbox" aria-label="Automatic web capture" checked={websiteAccess && state.settings.autoCapture} onChange={(event) => void (event.target.checked ? enableCapture() : disableCapture())} /><span /></label>
        </div>
        <div className="divider" />
        <div className="setting-row">
          <div><h2>History limit</h2><p>Favorites are kept separately and never count toward this limit.</p></div>
          <select value={state.settings.historyLimit} onChange={(event) => void update({ historyLimit: Number(event.target.value) })} aria-label="History limit">
            <option value={100}>100 clips</option><option value={250}>250 clips</option><option value={500}>500 clips</option><option value={1000}>1,000 clips</option>
          </select>
        </div>
        <div className="divider" />
        <div className="setting-row">
          <div><h2>Automatic cleanup</h2><p>Remove older non-favorite clips based on when they were last copied or captured.</p></div>
          <select value={state.settings.retentionDays} onChange={(event) => void setRetention(Number(event.target.value) as RetentionDays)} aria-label="Automatic cleanup">
            <option value={0}>Keep indefinitely</option><option value={1}>After 24 hours</option><option value={7}>After 7 days</option><option value={30}>After 30 days</option><option value={90}>After 90 days</option>
          </select>
        </div>
      </section>

      <section className={`settings-card pause-card ${captureIsPaused(state.settings) ? 'is-paused' : ''}`}>
        <div className="card-heading"><div><span className="card-kicker">Quick privacy</span><h2>Pause automatic web capture</h2><p>{pauseDescription(state.settings)}</p></div></div>
        {captureIsPaused(state.settings) ? (
          <button className="resume-button" type="button" onClick={() => void update({ capturePaused: false, capturePausedUntil: null })}>Resume capture now</button>
        ) : (
          <div className="pause-controls">
            <select value={pausePreset} onChange={(event) => setPausePreset(event.target.value)} aria-label="Pause duration">
              <option value="15">15 minutes</option><option value="60">1 hour</option><option value="tomorrow">Until tomorrow morning</option><option value="indefinite">Until I resume</option>
            </select>
            <button type="button" onClick={() => void pauseCapture()}>Pause capture</button>
          </div>
        )}
      </section>

      <section className="settings-card capture-details-card">
        <div className="card-heading"><div><h2>What to capture</h2><p>Choose which categories automatic website capture can save. Manual clips and Save tab always remain available.</p></div></div>
        <div className="capture-type-grid">
          {CAPTURE_TYPE_OPTIONS.map(({ type, label, detail }) => {
            const checked = state.settings.captureTypes.includes(type);
            return <label className={`capture-type-option ${checked ? 'selected' : ''}`} key={type}><input type="checkbox" checked={checked} disabled={checked && state.settings.captureTypes.length === 1} onChange={() => void toggleCaptureType(type)} /><TypeGlyph type={type} /><span><strong>{label}</strong><small>{detail}</small></span></label>;
          })}
        </div>
        <div className="divider" />
        <div className="card-heading source-heading"><div><h2>Source information</h2><p>These choices affect future automatic captures. Existing clips remain unchanged.</p></div></div>
        <div className="source-options">
          <label><span><strong>Website source</strong><small>Store the page address so Clipboard+ can show its domain.</small></span><input type="checkbox" checked={state.settings.captureSourceUrl} onChange={(event) => void update({ captureSourceUrl: event.target.checked })} /></label>
          <label><span><strong>Page title</strong><small>Keep the page title for searching and context.</small></span><input type="checkbox" checked={state.settings.capturePageTitle} onChange={(event) => void update({ capturePageTitle: event.target.checked })} /></label>
          <label><span><strong>Source application</strong><small>Identify Chrome as the application that captured the clip.</small></span><input type="checkbox" checked={state.settings.captureSourceApp} onChange={(event) => void update({ captureSourceApp: event.target.checked })} /></label>
        </div>
      </section>

      <section className="settings-card site-card">
        <div className="card-heading"><div><h2>Excluded sites</h2><p>Clipboard+ will ignore copies made on these domains and their subdomains.</p></div></div>
        <form className="site-form" onSubmit={addSite}><input value={site} onChange={(event) => setSite(event.target.value)} placeholder="example.com" aria-label="Site to exclude" /><button type="submit" disabled={!site.trim()}><PlusIcon /> Add site</button></form>
        {state.settings.excludedSites.length ? (
          <ul className="site-list">{state.settings.excludedSites.map((hostname) => <li key={hostname}><span>{hostname}</span><button type="button" aria-label={`Remove ${hostname}`} onClick={() => void update({ excludedSites: state.settings.excludedSites.filter((item) => item !== hostname) })}><XIcon /></button></li>)}</ul>
        ) : <div className="no-sites">No sites are excluded.</div>}
      </section>

      <section className="settings-card privacy-card">
        <h2>Privacy and limitations</h2>
        <p>Clipboard+ stores clips only in Chrome's local extension storage. It identifies links and recognizable code locally, never uploads data, and uses no analytics or advertisements. Password and recognized payment/authentication fields are ignored.</p>
        <p>Chrome internal pages, the Chrome Web Store, browser UI, and other restricted pages cannot be captured. Website access is optional and can be removed by turning automatic capture off.</p>
        <p><a href="https://tonys-coding.github.io/ClipboardPlus/privacy.html" target="_blank" rel="noreferrer">Privacy policy</a> · <a href="https://tonys-coding.github.io/ClipboardPlus/support.html" target="_blank" rel="noreferrer">Support</a> · <a href="https://tonys-coding.github.io/ClipboardPlus/data-deletion.html" target="_blank" rel="noreferrer">Delete your data</a></p>
      </section>

      <section className="settings-card storage-card">
        <div className="card-heading"><div><span className="card-kicker">On this device</span><h2>Storage overview</h2><p>Clipboard+ keeps this data only in Chrome's local extension storage.</p></div></div>
        <div className="storage-grid">
          <div><strong>{state.clips.length}</strong><span>Total clips</span></div>
          <div><strong>{state.clips.filter((clip) => clip.favorite).length}</strong><span>Favorites</span></div>
          <div><strong>{state.clips.filter((clip) => clip.type === 'text').length}</strong><span>Text</span></div>
          <div><strong>{state.clips.filter((clip) => clip.type === 'url').length}</strong><span>Links</span></div>
          <div><strong>{state.clips.filter((clip) => clip.type === 'code').length}</strong><span>Code</span></div>
          <div><strong>{formatBytes(new TextEncoder().encode(JSON.stringify(state)).length)}</strong><span>Approx. usage</span></div>
        </div>
        <p className="oldest-clip">{state.clips.length ? `Oldest saved clip: ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(Math.min(...state.clips.map((clip) => clip.createdAt)))}` : 'No clips are currently stored.'}</p>
        <div className="danger-actions"><button type="button" onClick={() => void clear(false)}><TrashIcon /> Clear history</button><button className="danger" type="button" onClick={() => void clear(true)}><TrashIcon /> Clear all data</button></div>
      </section>

      <section className="settings-card about-card" aria-labelledby="about-heading">
        <div className="card-heading">
          <div>
            <span className="card-kicker">About &amp; help</span>
            <h2 id="about-heading">Clipboard+ {manifestVersion}</h2>
            <p>{buildProfile === 'development' ? 'Development build with the macOS Quick Paste companion.' : 'Chrome Web Store build. Free core features, local-only processing.'}</p>
          </div>
        </div>

        <div className="about-grid">
          <div className="about-block">
            <h3>Keyboard shortcut</h3>
            <p>{shortcutStatusText(shortcut, shortcutKnown)}</p>
            <button type="button" className="about-action" onClick={() => void chrome.tabs?.create?.({ url: SHORTCUT_SETTINGS_URL })}>Manage shortcuts</button>
            <small>This browser-only shortcut works while Chrome is in front and can be reassigned any time on Chrome's shortcut page. It does not run inside other applications.</small>
          </div>

          <div className="about-block">
            <h3>Release notes and support</h3>
            <p><a href={RELEASE_NOTES_URL} target="_blank" rel="noreferrer">Release notes</a> · <a href={SUPPORT_URL} target="_blank" rel="noreferrer">Help and support</a></p>
            <small>Chrome internal pages, the Chrome Web Store, and other browser-owned pages never expose copy events to extensions. Password fields and recognized payment or authentication fields are always ignored, and automatic capture stays off until you enable it.</small>
          </div>
        </div>

        <div className="divider" />

        <div className="about-block diagnostics-block">
          <h3>Troubleshooting details</h3>
          <p>Copy a short local checklist for support. It lists product version, build profile, capture booleans, website-access status, and listener health.</p>
          <pre className="diagnostics-preview">{buildTroubleshootingReport({
            manifestVersion,
            buildProfile,
            captureEnabled: state.settings.autoCapture,
            capturePaused: captureIsPaused(state.settings),
            consentCurrent: hasCurrentCaptureConsent(state.settings),
            websiteAccessGranted: websiteAccess,
            captureListenerRegistered: listenerRegistered,
          })}</pre>
          <small>It never includes clip contents, clip counts, page titles or addresses, excluded domains, identifiers, or raw errors. These details are only copied to your clipboard and are never sent anywhere by Clipboard+.</small>
          <div className="diagnostics-actions">
            <button type="button" className="about-action" onClick={() => void copyTroubleshooting()} disabled={diagnosticsFeedback === 'checking'}><ClipboardIcon /> Copy troubleshooting details</button>
            {diagnosticsFeedback === 'copied' && <span className="diagnostics-feedback"><CheckIcon /> Copied to clipboard</span>}
            {diagnosticsFeedback === 'error' && <span className="diagnostics-feedback error">{diagnosticsMessage}</span>}
          </div>
          <p className="sr-only" role="status" aria-live="polite">{diagnosticsMessage}</p>
        </div>
      </section>
    </main>
  );
}
