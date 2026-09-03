import { FormEvent, useEffect, useState } from 'react';
import { CheckIcon, PlusIcon, TrashIcon, XIcon } from '../components/Icons';
import { CAPTURE_CONSENT_VERSION, normalizeHostname } from '../lib/clips';
import { COMPANION_ENABLED } from '../lib/build';
import { removeWebsiteAccess, requestWebsiteAccess } from '../lib/capturePermissions';
import { sendMessage } from '../lib/runtime';
import type { Settings, StorageState } from '../lib/types';
import './options.css';

export function Options() {
  const [state, setState] = useState<StorageState | null>(null);
  const [site, setSite] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [companionOnline, setCompanionOnline] = useState(false);
  const [websiteAccess, setWebsiteAccess] = useState(false);

  useEffect(() => {
    void sendMessage({ type: COMPANION_ENABLED ? 'SYNC_COMPANION' : 'GET_STATE' }).then((response) => {
      if (response.state) setState(response.state);
      setCompanionOnline(Boolean(response.companion?.available));
      setWebsiteAccess(Boolean(response.permissions?.websiteAccess));
    }).catch((reason: Error) => setError(reason.message));
  }, []);

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

  const update = async (changes: Partial<Settings>) => {
    try {
      const response = await sendMessage({ type: 'UPDATE_SETTINGS', payload: changes });
      if (response.state) setState(response.state);
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
          <label className="switch"><input type="checkbox" checked={websiteAccess && state.settings.autoCapture} onChange={(event) => void (event.target.checked ? enableCapture() : disableCapture())} /><span /></label>
        </div>
        <div className="divider" />
        <div className="setting-row">
          <div><h2>History limit</h2><p>Favorites are kept separately and never count toward this limit.</p></div>
          <select value={state.settings.historyLimit} onChange={(event) => void update({ historyLimit: Number(event.target.value) })} aria-label="History limit">
            <option value={100}>100 clips</option><option value={250}>250 clips</option><option value={500}>500 clips</option><option value={1000}>1,000 clips</option>
          </select>
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

      <section className="settings-card danger-card">
        <div><h2>Stored data</h2><p>{state.clips.length} clip{state.clips.length === 1 ? '' : 's'} saved on this device.</p></div>
        <div className="danger-actions"><button type="button" onClick={() => void clear(false)}><TrashIcon /> Clear history</button><button className="danger" type="button" onClick={() => void clear(true)}><TrashIcon /> Clear all data</button></div>
      </section>
    </main>
  );
}
