import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ClipboardIcon, LinkIcon, PlusIcon, SearchIcon, SettingsIcon, StarIcon, XIcon } from '../components/Icons';
import { filterClips, STORAGE_KEY } from '../lib/clips';
import { sendMessage } from '../lib/runtime';
import type { Clip, StorageState } from '../lib/types';
import { ClipCard } from './ClipCard';
import { TypeGlyph } from './TypeGlyph';
import './popup.css';

type Toast = { kind: 'success' | 'error'; message: string } | null;
type CaptureStatus = 'checking' | 'active' | 'disabled' | 'excluded' | 'restricted' | 'unavailable';
type ClipFilter = 'all' | 'text' | 'url' | 'code' | 'favorite';

export function Popup() {
  const [state, setState] = useState<StorageState | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ClipFilter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<Clip | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>('checking');
  const addInput = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await sendMessage({ type: 'SYNC_COMPANION' });
      if (response.state) setState(response.state);
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load your clips.' });
    }
  }, []);

  useEffect(() => {
    void refresh();
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? '';
      if (!tab?.id || !/^(https?|file):\/\//i.test(url)) {
        setCaptureStatus('restricted');
        return;
      }

      const ping = () => chrome.tabs.sendMessage(tab.id!, { type: 'PING_CAPTURE' }) as Promise<{
        ready: boolean;
        settingsLoaded: boolean;
        enabled: boolean;
        excluded: boolean;
      }>;

      try {
        let response;
        try {
          response = await ping();
        } catch {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
          await new Promise((resolve) => window.setTimeout(resolve, 100));
          response = await ping();
        }
        setCaptureStatus(response.excluded ? 'excluded' : response.enabled ? 'active' : 'disabled');
      } catch {
        setCaptureStatus('unavailable');
      }
    })();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STORAGE_KEY]?.newValue) setState(changes[STORAGE_KEY].newValue as StorageState);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);

  useEffect(() => {
    if (addOpen) addInput.current?.focus();
  }, [addOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const perform = async (action: Parameters<typeof sendMessage>[0], success?: string) => {
    try {
      const response = await sendMessage(action);
      if (response.state) setState(response.state);
      if (success) setToast({ kind: 'success', message: success });
      return true;
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' });
      return false;
    }
  };

  const visible = useMemo(() => {
    const matches = filterClips(state?.clips ?? [], query);
    if (filter === 'favorite') return matches.filter((clip) => clip.favorite);
    if (filter === 'text' || filter === 'url' || filter === 'code') return matches.filter((clip) => clip.type === filter);
    return matches;
  }, [filter, query, state?.clips]);
  const counts = useMemo(() => {
    const clips = state?.clips ?? [];
    return {
      all: clips.length,
      text: clips.filter((clip) => clip.type === 'text').length,
      url: clips.filter((clip) => clip.type === 'url').length,
      code: clips.filter((clip) => clip.type === 'code').length,
      favorite: clips.filter((clip) => clip.favorite).length,
    };
  }, [state?.clips]);
  const favorites = visible.filter((clip) => clip.favorite);
  const history = visible.filter((clip) => !clip.favorite);

  const handleCopy = async (clip: Clip) => {
    try {
      await navigator.clipboard.writeText(clip.content);
      setCopiedId(clip.id);
      window.setTimeout(() => setCopiedId((id) => (id === clip.id ? null : id)), 1400);
    } catch {
      setToast({ kind: 'error', message: 'Clipboard access was blocked. Try clicking again.' });
    }
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (await perform({ type: 'ADD_CLIP', payload: { content: draft } }, 'Saved to Clipboard+')) {
      setDraft('');
      setAddOpen(false);
    }
  };

  const saveTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !/^https?:\/\//i.test(tab.url)) throw new Error('This Chrome page cannot be saved.');
      await perform({ type: 'ADD_CLIP', payload: { content: tab.url, title: tab.title, sourceUrl: tab.url } }, 'Current tab saved');
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Could not save this tab.' });
    }
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (await perform({ type: 'UPDATE_CLIP', payload: { id: editing.id, content: editDraft, title: editing.title } }, 'Clip updated')) setEditing(null);
  };

  const renderSection = (title: string, clips: Clip[], favorite = false) => {
    if (!clips.length) return null;
    return (
      <section className="clip-section">
        <div className="section-heading">
          <span>{favorite && <span className="heading-star">★</span>}{title}</span>
          <span>{clips.length}</span>
        </div>
        <div className="clip-list">
          {clips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              copied={copiedId === clip.id}
              onCopy={handleCopy}
              onEdit={(item) => { setEditing(item); setEditDraft(item.content); }}
              onFavorite={(item) => void perform({ type: 'TOGGLE_FAVORITE', payload: { id: item.id } })}
              onDelete={(item) => void perform({ type: 'DELETE_CLIP', payload: { id: item.id } }, 'Clip deleted')}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <main className="popup-shell">
      <header className="app-header">
        <div className="brand">
          <img className="brand-mark" src="/icons/clipboard-plus-logo.png" alt="" />
          <div><small>Capture / Recall</small><span>Clipboard<strong>+</strong></span></div>
        </div>
        <div className="header-actions"><span className="local-badge">Local only</span><button className="icon-button" type="button" aria-label="Open settings" onClick={() => void chrome.runtime.openOptionsPage()}><SettingsIcon /></button></div>
      </header>

      <div className="command-row">
        <label className="search-box">
          <SearchIcon />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a clip…" aria-label="Search clips" />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><XIcon /></button>}
        </label>
        <div className="quick-actions">
          <button type="button" className={`action-button ${addOpen ? 'active' : ''}`} onClick={() => setAddOpen((open) => !open)}><PlusIcon /> Add clip</button>
          <button type="button" className="action-button" onClick={() => void saveTab()}><LinkIcon /> Save tab</button>
        </div>
      </div>

      {addOpen && (
        <form className="add-panel" onSubmit={handleAdd}>
          <label htmlFor="new-clip">Paste or type anything</label>
          <textarea id="new-clip" ref={addInput} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Text or https://example.com" maxLength={50_000} required />
          <div className="form-actions"><button type="button" className="text-button" onClick={() => setAddOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={!draft.trim()}><PlusIcon /> Save clip</button></div>
        </form>
      )}

      <div className="filter-bar" role="group" aria-label="Filter clips">
        <button type="button" aria-label="All" aria-pressed={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><span>All</span><b>{counts.all}</b></button>
        <button type="button" aria-label="Text" aria-pressed={filter === 'text'} className={filter === 'text' ? 'active' : ''} onClick={() => setFilter('text')}><TypeGlyph type="text" /><span>Text</span><b>{counts.text}</b></button>
        <button type="button" aria-label="Links" aria-pressed={filter === 'url'} className={filter === 'url' ? 'active' : ''} onClick={() => setFilter('url')}><TypeGlyph type="url" /><span>Links</span><b>{counts.url}</b></button>
        <button type="button" aria-label="Code" aria-pressed={filter === 'code'} className={filter === 'code' ? 'active' : ''} onClick={() => setFilter('code')}><TypeGlyph type="code" /><span>Code</span><b>{counts.code}</b></button>
        <button type="button" aria-label="Favorites" aria-pressed={filter === 'favorite'} className={filter === 'favorite' ? 'active' : ''} onClick={() => setFilter('favorite')}><StarIcon /><span>Saved</span><b>{counts.favorite}</b></button>
      </div>

      {captureStatus === 'restricted' && <div className="notice"><span>This browser page cannot be captured. Try a normal website.</span></div>}
      {captureStatus === 'unavailable' && <div className="notice error-notice"><span>Clipboard+ could not access this tab. Check the extension's Site access setting, then refresh the page.</span></div>}
      {captureStatus === 'excluded' && <div className="notice"><span>This site is excluded in Clipboard+ settings.</span></div>}
      {captureStatus === 'disabled' && <div className="notice"><span>Automatic capture is turned off in Clipboard+ settings.</span></div>}

      <div className="status-strip"><span>Web ready</span><span>Mac connected</span></div>

      <div className="content-scroll">
        {!state ? (
          <div className="loading"><span /><span /><span /></div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">{query ? <SearchIcon /> : <ClipboardIcon />}</span>
            <h2>{query || filter !== 'all' ? 'No matching clips' : 'Your clipboard is ready'}</h2>
            <p>{query || filter !== 'all' ? 'Try another search or filter.' : 'Copy text in any app or add your first clip above.'}</p>
          </div>
        ) : (
          <>{renderSection('Favorites', favorites, true)}{renderSection('Recent', history)}</>
        )}
      </div>

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <form className="edit-modal" onSubmit={saveEdit} role="dialog" aria-modal="true" aria-labelledby="edit-heading">
            <div className="modal-heading"><h2 id="edit-heading">Edit clip</h2><button type="button" className="icon-button" aria-label="Close edit dialog" onClick={() => setEditing(null)}><XIcon /></button></div>
            <label htmlFor="edit-clip">Content</label>
            <textarea id="edit-clip" autoFocus value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={50_000} required />
            <div className="form-actions"><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="primary-button" disabled={!editDraft.trim()}><CheckIcon /> Save changes</button></div>
          </form>
        </div>
      )}

      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.kind === 'success' ? <CheckIcon /> : <span>!</span>}{toast.message}</div>}
    </main>
  );
}
