import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ClipboardIcon, LinkIcon, PlusIcon, SearchIcon, SettingsIcon, XIcon } from '../components/Icons';
import { filterClips, STORAGE_KEY } from '../lib/clips';
import { sendMessage } from '../lib/runtime';
import type { Clip, StorageState } from '../lib/types';
import { ClipCard } from './ClipCard';
import './popup.css';

type CaptureStatus = 'checking' | 'active' | 'disabled' | 'excluded' | 'restricted' | 'unavailable';

export function Popup() {
  const [state, setState] = useState<StorageState | null>(null);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<Clip | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>('checking');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void sendMessage({ type: 'GET_STATE' }).then((response) => response.state && setState(response.state)).catch((error: Error) => setMessage(error.message));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STORAGE_KEY]?.newValue) setState(changes[STORAGE_KEY].newValue as StorageState);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? '';
      if (!tab?.id || !/^(https?|file):\/\//i.test(url)) { setCaptureStatus('restricted'); return; }
      const ping = () => chrome.tabs.sendMessage(tab.id!, { type: 'PING_CAPTURE' }) as Promise<{ enabled: boolean; excluded: boolean }>;
      try {
        let response;
        try { response = await ping(); }
        catch { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); await new Promise((resolve) => window.setTimeout(resolve, 100)); response = await ping(); }
        setCaptureStatus(response.excluded ? 'excluded' : response.enabled ? 'active' : 'disabled');
      } catch { setCaptureStatus('unavailable'); }
    })();
  }, []);
  useEffect(() => { if (addOpen) inputRef.current?.focus(); }, [addOpen]);

  const perform = async (action: Parameters<typeof sendMessage>[0]) => {
    try { const response = await sendMessage(action); if (response.state) setState(response.state); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Something went wrong.'); return false; }
  };
  const visible = useMemo(() => filterClips(state?.clips ?? [], query), [query, state?.clips]);
  const favorites = visible.filter((clip) => clip.favorite);
  const history = visible.filter((clip) => !clip.favorite);

  const copy = async (clip: Clip) => {
    try { await navigator.clipboard.writeText(clip.content); setCopiedId(clip.id); window.setTimeout(() => setCopiedId(null), 1200); }
    catch { setMessage('Clipboard access was blocked. Try clicking again.'); }
  };
  const add = async (event: FormEvent) => { event.preventDefault(); if (await perform({ type: 'ADD_CLIP', payload: { content: draft } })) { setDraft(''); setAddOpen(false); } };
  const saveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https?:\/\//i.test(tab.url)) { setMessage('This Chrome page cannot be saved.'); return; }
    await perform({ type: 'ADD_CLIP', payload: { content: tab.url, title: tab.title, sourceUrl: tab.url } });
  };
  const saveEdit = async (event: FormEvent) => { event.preventDefault(); if (editing && await perform({ type: 'UPDATE_CLIP', payload: { id: editing.id, content: editDraft, title: editing.title } })) setEditing(null); };
  const section = (title: string, clips: Clip[]) => clips.length ? <section><div className="section-heading"><span>{title}</span><span>{clips.length}</span></div><div className="clip-list">{clips.map((clip) => <ClipCard key={clip.id} clip={clip} copied={copiedId === clip.id} onCopy={copy} onEdit={(item) => { setEditing(item); setEditDraft(item.content); }} onFavorite={(item) => void perform({ type: 'TOGGLE_FAVORITE', payload: { id: item.id } })} onDelete={(item) => void perform({ type: 'DELETE_CLIP', payload: { id: item.id } })} />)}</div></section> : null;

  return <main className="popup-shell">
    <header className="app-header"><div className="brand"><ClipboardIcon /><span>Clipboard+</span></div><button className="icon-button" aria-label="Open settings" onClick={() => void chrome.runtime.openOptionsPage()}><SettingsIcon /></button></header>
    <div className="command-row"><label className="search-box"><SearchIcon /><input aria-label="Search clips" placeholder="Search clips" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><XIcon /></button>}</label><div className="quick-actions"><button onClick={() => setAddOpen((value) => !value)}><PlusIcon />Add clip</button><button onClick={() => void saveTab()}><LinkIcon />Save tab</button></div></div>
    {addOpen && <form className="panel" onSubmit={add}><label htmlFor="new-clip">Paste or type anything</label><textarea id="new-clip" ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} required /><button disabled={!draft.trim()}><PlusIcon />Save clip</button></form>}
    {message && <div className="notice">{message}</div>}
    {captureStatus === 'restricted' && <div className="notice">This browser page cannot be captured. Try a normal website.</div>}
    {captureStatus === 'unavailable' && <div className="notice">Clipboard+ could not access this tab. Check Site access and refresh it.</div>}
    {captureStatus === 'excluded' && <div className="notice">This site is excluded in Clipboard+ settings.</div>}
    {captureStatus === 'disabled' && <div className="notice">Automatic capture is turned off.</div>}
    <div className="content-scroll">{!state ? <div className="empty-state">Loading…</div> : !visible.length ? <div className="empty-state"><ClipboardIcon /><h2>{query ? 'No matching clips' : 'Your clipboard is ready'}</h2><p>{query ? 'Try another search.' : 'Copy text on a webpage or add your first clip.'}</p></div> : <>{section('Favorites', favorites)}{section('Recent', history)}</>}</div>
    {editing && <div className="modal-backdrop"><form className="edit-modal" onSubmit={saveEdit}><div><h2>Edit clip</h2><button type="button" aria-label="Close edit dialog" onClick={() => setEditing(null)}><XIcon /></button></div><label htmlFor="edit-clip">Content</label><textarea id="edit-clip" value={editDraft} onChange={(event) => setEditDraft(event.target.value)} required /><button disabled={!editDraft.trim()}><CheckIcon />Save changes</button></form></div>}
  </main>;
}
