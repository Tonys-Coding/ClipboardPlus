import { FormEvent, useEffect, useState } from 'react';
import { CheckIcon, PlusIcon, TrashIcon, XIcon } from '../components/Icons';
import { normalizeHostname } from '../lib/clips';
import { sendMessage } from '../lib/runtime';
import type { Settings, StorageState } from '../lib/types';
import './options.css';

export function Options() {
  const [state, setState] = useState<StorageState | null>(null);
  const [site, setSite] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [companionOnline, setCompanionOnline] = useState(false);

  useEffect(() => {
    void sendMessage({ type: 'SYNC_COMPANION' }).then((response) => {
      if (response.state) setState(response.state);
      setCompanionOnline(Boolean(response.companion?.available));
    }).catch((reason: Error) => setError(reason.message));
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
      <header className="options-header">
        <img className="options-logo" src="/icons/clipboard-plus-logo.png" alt="Clipboard+ logo" />
        <div><h1>Capture controls</h1><p>Choose what Clipboard+ collects and keeps on this device.</p></div>
        {saved && <span className="saved-badge"><CheckIcon /> Saved</span>}
      </header>

      {error && <div className="error-banner">{error}<button type="button" onClick={() => setError('')}><XIcon /></button></div>}

      <section className="settings-card companion-card">
        <div>
          <h2>Quick Paste</h2>
          <p>Press ⌃⇧V anywhere to search your favorites and recent clips. Return pastes into the previous app; ⌘Return copies without pasting.</p>
        </div>
        <span className={`connection-badge ${companionOnline ? 'online' : ''}`}><span />{companionOnline ? 'Connected' : 'Offline'}</span>
      </section>

      <section className="settings-card">
        <div className="setting-row">
          <div><h2>Automatic web capture</h2><p>Save text when you copy it on supported webpages.</p></div>
          <label className="switch"><input type="checkbox" checked={state.settings.autoCapture} onChange={(event) => void update({ autoCapture: event.target.checked })} /><span /></label>
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
        <p>Clipboard+ stores clips only in Chrome's local extension storage. It identifies links and recognizable code locally, never uploads data, and uses no analytics. Password and recognized payment/authentication fields are ignored.</p>
        <p>Chrome internal pages, the Chrome Web Store, and other restricted browser pages cannot be captured. Desktop-app copies are collected only while the optional macOS companion is running.</p>
      </section>

      <section className="settings-card danger-card">
        <div><h2>Stored data</h2><p>{state.clips.length} clip{state.clips.length === 1 ? '' : 's'} saved on this device.</p></div>
        <div className="danger-actions"><button type="button" onClick={() => void clear(false)}><TrashIcon /> Clear history</button><button className="danger" type="button" onClick={() => void clear(true)}><TrashIcon /> Clear all data</button></div>
      </section>
    </main>
  );
}
