import { FormEvent, useEffect, useState } from 'react';
import { PlusIcon, TrashIcon, XIcon } from '../components/Icons';
import { normalizeHostname } from '../lib/clips';
import { sendMessage } from '../lib/runtime';
import type { Settings, StorageState } from '../lib/types';
import './options.css';

export function Options() {
  const [state, setState] = useState<StorageState | null>(null);
  const [site, setSite] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void sendMessage({ type: 'GET_STATE' }).then((response) => response.state && setState(response.state)).catch((reason: Error) => setError(reason.message)); }, []);
  const update = async (changes: Partial<Settings>) => { try { const response = await sendMessage({ type: 'UPDATE_SETTINGS', payload: changes }); if (response.state) setState(response.state); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save settings.'); } };
  const addSite = (event: FormEvent) => { event.preventDefault(); const hostname = normalizeHostname(site); if (!hostname || !state) { setError('Enter a valid site, such as example.com.'); return; } void update({ excludedSites: [...state.settings.excludedSites, hostname] }); setSite(''); };
  const clear = async (all: boolean) => { if (!window.confirm(all ? 'Delete every clip, including favorites?' : 'Delete all non-favorite history?')) return; const response = await sendMessage({ type: all ? 'CLEAR_ALL' : 'CLEAR_HISTORY' }); if (response.state) setState(response.state); };
  if (!state) return <main className="options-shell">{error || 'Loading Clipboard+…'}</main>;
  return <main className="options-shell"><header><h1>Clipboard+ settings</h1><p>All data stays in Chrome local storage.</p></header>{error && <div className="error-banner">{error}<button onClick={() => setError('')}><XIcon /></button></div>}
    <section><div className="setting-row"><div><h2>Automatic web capture</h2><p>Save text when you copy it on supported webpages.</p></div><input type="checkbox" checked={state.settings.autoCapture} onChange={(event) => void update({ autoCapture: event.target.checked })} /></div><div className="setting-row"><div><h2>History limit</h2><p>Favorites never count toward this limit.</p></div><select aria-label="History limit" value={state.settings.historyLimit} onChange={(event) => void update({ historyLimit: Number(event.target.value) })}><option value="100">100 clips</option><option value="250">250 clips</option><option value="500">500 clips</option><option value="1000">1,000 clips</option></select></div></section>
    <section><h2>Excluded sites</h2><form onSubmit={addSite}><input aria-label="Site to exclude" value={site} onChange={(event) => setSite(event.target.value)} placeholder="example.com" /><button disabled={!site.trim()}><PlusIcon />Add site</button></form><ul>{state.settings.excludedSites.map((hostname) => <li key={hostname}>{hostname}<button aria-label={`Remove ${hostname}`} onClick={() => void update({ excludedSites: state.settings.excludedSites.filter((item) => item !== hostname) })}><XIcon /></button></li>)}</ul></section>
    <section><h2>Privacy and limitations</h2><p>Clipboard+ does not read the system clipboard. Chrome internal pages, the Chrome Web Store, other restricted pages, and desktop apps cannot be captured. Password and recognized payment or authentication fields are ignored.</p></section>
    <section className="danger-row"><button onClick={() => void clear(false)}><TrashIcon />Clear history</button><button onClick={() => void clear(true)}><TrashIcon />Clear all data</button></section>
  </main>;
}
